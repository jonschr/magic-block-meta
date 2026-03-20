<?php
/*
	Plugin Name: Elodin Block Meta
	Plugin URI: https://elod.in
	Description: Generic block and editor tools for rendering and editing registered post meta in block themes.
	Version: 0.1.0
	Author: Jon Schroeder
	Author URI: https://elod.in
*/

if ( ! defined( 'ABSPATH' ) ) {
	exit;
}

define( 'ELODIN_BLOCK_META_VERSION', '0.1.0' );
define( 'ELODIN_BLOCK_META_OVERRIDE_KEY', 'elodin_block_meta_overrides' );

/**
 * Register the editor script and block type.
 */
function elodin_block_meta_register() {
	wp_register_script(
		'elodin-block-meta-editor',
		plugins_url( 'index.js', __FILE__ ),
		array(
			'wp-blocks',
			'wp-block-editor',
			'wp-components',
			'wp-core-data',
			'wp-data',
			'wp-element',
			'wp-hooks',
			'wp-i18n',
		),
		ELODIN_BLOCK_META_VERSION,
		true
	);

	wp_localize_script(
		'elodin-block-meta-editor',
		'elodinBlockMetaSettings',
		array(
			'fields'           => elodin_block_meta_get_string_fields(),
			'overrideMetaKey' => ELODIN_BLOCK_META_OVERRIDE_KEY,
		)
	);

	wp_register_script(
		'elodin-block-meta-panel',
		plugins_url( 'panel.js', __FILE__ ),
		array(
			'wp-components',
			'wp-data',
			'wp-edit-post',
			'wp-element',
			'wp-i18n',
			'wp-plugins',
		),
		ELODIN_BLOCK_META_VERSION,
		true
	);

	wp_localize_script(
		'elodin-block-meta-panel',
		'elodinBlockMetaSettings',
		array(
			'fields'           => elodin_block_meta_get_string_fields(),
			'overrideMetaKey' => ELODIN_BLOCK_META_OVERRIDE_KEY,
		)
	);

	register_block_type(
		__DIR__ . '/block.json',
		array(
			'render_callback' => 'elodin_block_meta_render_block',
		)
	);
}
add_action( 'init', 'elodin_block_meta_register', 30 );

/**
 * Register the internal override map used to preserve block/sidebar-edited values.
 */
function elodin_block_meta_register_internal_meta() {
	register_meta(
		'post',
		ELODIN_BLOCK_META_OVERRIDE_KEY,
		array(
			'type'              => 'object',
			'single'            => true,
			'show_in_rest'      => array(
				'schema' => array(
					'type'                 => 'object',
					'additionalProperties' => array(
						'type' => 'string',
					),
				),
			),
			'sanitize_callback' => 'elodin_block_meta_sanitize_overrides',
			'auth_callback'     => 'elodin_block_meta_can_edit_meta',
		)
	);
}
add_action( 'init', 'elodin_block_meta_register_internal_meta', 20 );

/**
 * Capability check for internal meta editing.
 *
 * @return bool
 */
function elodin_block_meta_can_edit_meta() {
	return current_user_can( 'edit_posts' );
}

/**
 * Sanitize the override map.
 *
 * @param mixed $value Raw override map.
 * @return array<string, string>
 */
function elodin_block_meta_sanitize_overrides( $value ) {
	if ( ! is_array( $value ) ) {
		return array();
	}

	$sanitized = array();

	foreach ( $value as $meta_key => $meta_value ) {
		if ( ! is_string( $meta_key ) || '' === $meta_key ) {
			continue;
		}

		if ( is_scalar( $meta_value ) ) {
			$sanitized[ $meta_key ] = sanitize_text_field( (string) $meta_value );
		}
	}

	return $sanitized;
}

/**
 * Allow the custom block's value attribute to participate in block bindings.
 *
 * @param array $supported_attributes Supported attributes.
 * @return array
 */
function elodin_block_meta_support_bindings( $supported_attributes ) {
	$supported_attributes[] = 'value';

	return array_values( array_unique( $supported_attributes ) );
}
add_filter( 'block_bindings_supported_attributes_elodin/block-meta', 'elodin_block_meta_support_bindings' );

/**
 * Load the document settings panel only in the post editor.
 */
function elodin_block_meta_enqueue_panel_script() {
	$screen = get_current_screen();

	if ( ! $screen || ! in_array( $screen->base, array( 'post', 'post-new' ), true ) ) {
		return;
	}

	wp_enqueue_script( 'elodin-block-meta-panel' );
}
add_action( 'enqueue_block_editor_assets', 'elodin_block_meta_enqueue_panel_script' );

/**
 * Ensure post types with compatible meta can save via the editor REST flow.
 */
function elodin_block_meta_enable_custom_fields_support() {
	$field_map = elodin_block_meta_get_string_fields();

	foreach ( array_keys( $field_map ) as $post_type ) {
		if ( post_type_exists( $post_type ) ) {
			add_post_type_support( $post_type, 'custom-fields' );
		}
	}
}
add_action( 'init', 'elodin_block_meta_enable_custom_fields_support', 40 );

/**
 * Re-apply override values after REST saves so this plugin remains authoritative.
 */
function elodin_block_meta_register_rest_priority_hooks() {
	$field_map = elodin_block_meta_get_string_fields();

	foreach ( array_keys( $field_map ) as $post_type ) {
		add_action(
			'rest_after_insert_' . $post_type,
			'elodin_block_meta_reapply_overrides_after_rest',
			20,
			3
		);
	}
}
add_action( 'init', 'elodin_block_meta_register_rest_priority_hooks', 50 );

/**
 * Re-apply override values to registered meta fields after REST saves.
 *
 * @param WP_Post         $post     Inserted or updated post.
 * @param WP_REST_Request $request  Request object.
 * @param bool            $creating Whether this is a creation request.
 */
function elodin_block_meta_reapply_overrides_after_rest( $post, $request, $creating ) {
	unset( $request, $creating );

	if ( ! $post instanceof WP_Post ) {
		return;
	}

	$overrides = get_post_meta( $post->ID, ELODIN_BLOCK_META_OVERRIDE_KEY, true );

	if ( ! is_array( $overrides ) || empty( $overrides ) ) {
		return;
	}

	$allowed_fields = elodin_block_meta_get_string_fields();
	$allowed_fields = isset( $allowed_fields[ $post->post_type ] ) ? $allowed_fields[ $post->post_type ] : array();
	$allowed_keys   = wp_list_pluck( $allowed_fields, 'value' );

	foreach ( $overrides as $meta_key => $value ) {
		if ( ! in_array( $meta_key, $allowed_keys, true ) ) {
			continue;
		}

		update_post_meta( $post->ID, $meta_key, sanitize_text_field( (string) $value ) );
	}
}

/**
 * Build a map of registered, editable string meta fields keyed by post type.
 *
 * @return array<string, array<int, array<string, string>>>
 */
function elodin_block_meta_get_string_fields() {
	static $field_map = null;

	if ( null !== $field_map ) {
		return $field_map;
	}

	$field_map  = array();
	$post_types = get_post_types(
		array(
			'show_ui' => true,
		),
		'objects'
	);

	foreach ( $post_types as $post_type => $post_type_object ) {
		if ( ! $post_type_object instanceof WP_Post_Type ) {
			continue;
		}

		$registered_meta = get_registered_meta_keys( 'post', $post_type );

		if ( empty( $registered_meta ) ) {
			continue;
		}

		$fields = array();

		foreach ( $registered_meta as $meta_key => $args ) {
			if ( 0 === strpos( $meta_key, '_' ) ) {
				continue;
			}

			if ( empty( $args['show_in_rest'] ) || empty( $args['single'] ) ) {
				continue;
			}

			if ( isset( $args['type'] ) && 'string' !== $args['type'] ) {
				continue;
			}

			$fields[] = array(
				'value' => $meta_key,
				'label' => elodin_block_meta_get_field_label( $meta_key, $args ),
			);
		}

		if ( empty( $fields ) ) {
			continue;
		}

		usort(
			$fields,
			static function ( $first, $second ) {
				return strcasecmp( $first['label'], $second['label'] );
			}
		);

		$field_map[ $post_type ] = $fields;
	}

	return $field_map;
}

/**
 * Derive a friendly label for a meta key.
 *
 * @param string $meta_key Meta key.
 * @param array  $args     Meta registration args.
 * @return string
 */
function elodin_block_meta_get_field_label( $meta_key, $args ) {
	if ( ! empty( $args['label'] ) && is_string( $args['label'] ) ) {
		return $args['label'];
	}

	if ( ! empty( $args['description'] ) && is_string( $args['description'] ) ) {
		return $args['description'];
	}

	$label = preg_replace( '/[_-]+/', ' ', $meta_key );
	$label = is_string( $label ) ? trim( $label ) : $meta_key;
	$label = preg_replace( '/^(choice|elodin)\s+/i', '', $label );
	$label = is_string( $label ) ? trim( $label ) : $meta_key;

	return ucwords( $label );
}

/**
 * Render the selected meta value on the frontend.
 *
 * @param array    $attributes Block attributes.
 * @param string   $content    Saved block content.
 * @param WP_Block $block      Parsed block instance.
 * @return string
 */
function elodin_block_meta_render_block( $attributes, $content, $block ) {
	$value = isset( $attributes['value'] ) && is_scalar( $attributes['value'] ) ? trim( (string) $attributes['value'] ) : '';

	if ( '' === $value ) {
		$meta_key = isset( $attributes['metaKey'] ) && is_string( $attributes['metaKey'] ) ? $attributes['metaKey'] : '';

		if ( '' !== $meta_key ) {
			$post_id = 0;

			if ( isset( $block->context['postId'] ) ) {
				$post_id = absint( $block->context['postId'] );
			}

			if ( ! $post_id ) {
				$post_id = get_the_ID();
			}

			if ( $post_id ) {
				$overrides = get_post_meta( $post_id, ELODIN_BLOCK_META_OVERRIDE_KEY, true );

				if ( is_array( $overrides ) && array_key_exists( $meta_key, $overrides ) ) {
					$fallback_value = $overrides[ $meta_key ];
				} else {
					$fallback_value = get_post_meta( $post_id, $meta_key, true );
				}

				if ( is_scalar( $fallback_value ) ) {
					$value = trim( (string) $fallback_value );
				}
			}
		}
	}

	if ( '' === $value ) {
		return '';
	}

	return sprintf(
		'<div %1$s>%2$s</div>',
		get_block_wrapper_attributes(),
		esc_html( $value )
	);
}
