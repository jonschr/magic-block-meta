<?php
/*
	Plugin Name: Magic Block Meta
	Plugin URI: https://elod.in
	Description: Generic block and editor tools for rendering and editing registered post meta in block themes.
	Version: 0.1.10
	Author: Jon Schroeder
	Author URI: https://elod.in
*/

if ( ! defined( 'ABSPATH' ) ) {
	exit;
}

define( 'MAGIC_BLOCK_META_DIR', plugin_dir_path( __FILE__ ) );
define( 'MAGIC_BLOCK_META_VERSION', '0.1.10' );

/**
 * Register the editor script and block type.
 */
function magic_block_meta_register() {
	wp_register_script(
		'magic-block-meta-editor',
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
		MAGIC_BLOCK_META_VERSION,
		true
	);

	wp_localize_script(
		'magic-block-meta-editor',
		'magicBlockMetaSettings',
		array(
			'fields' => magic_block_meta_get_supported_fields(),
		)
	);

	wp_register_script(
		'magic-block-meta-panel',
		plugins_url( 'panel.js', __FILE__ ),
		array(
			'wp-api-fetch',
			'wp-components',
			'wp-data',
			'wp-edit-post',
			'wp-element',
			'wp-i18n',
			'wp-plugins',
		),
		MAGIC_BLOCK_META_VERSION,
		true
	);


	wp_register_style(
		'magic-block-meta-editor-style',
		plugins_url( 'editor.css', __FILE__ ),
		array(),
		MAGIC_BLOCK_META_VERSION
	);

	wp_localize_script(
		'magic-block-meta-panel',
		'magicBlockMetaSettings',
		array(
			'fields' => magic_block_meta_get_supported_fields(),
		)
	);

	register_block_type(
		__DIR__ . '/block.json',
		array(
			'render_callback' => 'magic_block_meta_render_block',
		)
	);

	register_block_type(
		__DIR__ . '/conditional-block.json',
		array(
			'render_callback' => 'magic_block_meta_render_conditional_block',
		)
	);

	register_block_type(
		__DIR__ . '/placeholder-block.json',
		array(
			'render_callback' => 'magic_block_meta_render_placeholder_block',
		)
	);

	register_block_type(
		__DIR__ . '/terms-block.json',
		array(
			'render_callback'    => 'magic_block_meta_render_post_terms_block',
			'variation_callback' => 'magic_block_meta_build_post_terms_variations',
		)
	);
}
add_action( 'init', 'magic_block_meta_register', 30 );

/**
 * Allow the custom block's value attribute to participate in block bindings.
 *
 * @param array $supported_attributes Supported attributes.
 * @return array
 */
function magic_block_meta_support_bindings( $supported_attributes ) {
	$supported_attributes[] = 'value';

	return array_values( array_unique( $supported_attributes ) );
}
add_filter( 'block_bindings_supported_attributes_magic/block-meta', 'magic_block_meta_support_bindings' );

/**
 * Load the document settings panel only in the post editor.
 */
function magic_block_meta_enqueue_panel_script() {
	$screen = get_current_screen();

	if ( ! $screen || ! in_array( $screen->base, array( 'post', 'post-new' ), true ) ) {
		return;
	}

	wp_enqueue_script( 'magic-block-meta-panel' );
	wp_enqueue_style( 'magic-block-meta-editor-style' );
}
add_action( 'enqueue_block_editor_assets', 'magic_block_meta_enqueue_panel_script' );

/**
 * Ensure post types with compatible meta can save via the editor REST flow.
 */
function magic_block_meta_enable_custom_fields_support() {
	$field_map = magic_block_meta_get_supported_fields();

	foreach ( array_keys( $field_map ) as $post_type ) {
		if ( post_type_exists( $post_type ) ) {
			add_post_type_support( $post_type, 'custom-fields' );
		}
	}
}
add_action( 'init', 'magic_block_meta_enable_custom_fields_support', 40 );

/**
 * Build a map of registered, editable supported meta fields keyed by post type.
 *
 * @return array<string, array<int, array<string, mixed>>>
 */
function magic_block_meta_get_supported_fields() {
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

			$field_type = magic_block_meta_get_field_type( $args );

			if ( '' === $field_type ) {
				continue;
			}

			$fields[] = array(
				'value'     => $meta_key,
				'label'     => magic_block_meta_get_field_label( $meta_key, $args ),
				'type'      => $field_type,
				'multiline' => 'text' === $field_type && ! empty( $args['sanitize_callback'] ) && 'sanitize_textarea_field' === $args['sanitize_callback'],
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
 * Resolve the supported field type from registered meta arguments.
 *
 * @param array $args Meta registration args.
 * @return string
 */
function magic_block_meta_get_field_type( $args ) {
	$type = isset( $args['type'] ) && is_string( $args['type'] ) ? $args['type'] : '';

	if ( 'string' === $type ) {
		return 'text';
	}

	return '';
}

/**
 * Derive a friendly label for a meta key.
 *
 * @param string $meta_key Meta key.
 * @param array  $args     Meta registration args.
 * @return string
 */
function magic_block_meta_get_field_label( $meta_key, $args ) {
	if ( ! empty( $args['label'] ) && is_string( $args['label'] ) ) {
		return $args['label'];
	}

	if ( ! empty( $args['description'] ) && is_string( $args['description'] ) ) {
		return $args['description'];
	}

	$label = preg_replace( '/[_-]+/', ' ', $meta_key );
	$label = is_string( $label ) ? trim( $label ) : $meta_key;
	$label = preg_replace( '/^(choice|magic)\s+/i', '', $label );
	$label = is_string( $label ) ? trim( $label ) : $meta_key;

	return ucwords( $label );
}

/**
 * Resolve the current post ID for frontend block rendering.
 *
 * @param WP_Block $block Parsed block instance.
 * @return int
 */
function magic_block_meta_resolve_post_id( $block ) {
	$post_id = 0;

	if ( $block instanceof WP_Block && isset( $block->context['postId'] ) ) {
		$post_id = absint( $block->context['postId'] );
	}

	if ( ! $post_id ) {
		$post_id = get_the_ID();
	}

	return absint( $post_id );
}

/**
 * Get the current value for a meta key, honoring this plugin's override map.
 *
 * @param int    $post_id  Post ID.
 * @param string $meta_key Meta key.
 * @return string
 */
function magic_block_meta_get_post_meta_value( $post_id, $meta_key ) {
	$post_id  = absint( $post_id );
	$meta_key = is_string( $meta_key ) ? $meta_key : '';

	if ( ! $post_id || '' === $meta_key ) {
		return '';
	}

	$value = get_post_meta( $post_id, $meta_key, true );

	if ( ! is_scalar( $value ) ) {
		return '';
	}

	return trim( (string) $value );
}

/**
 * Resolve the value a meta field block should render.
 *
 * @param array    $attributes Block attributes.
 * @param WP_Block $block      Parsed block instance.
 * @return string
 */
function magic_block_meta_get_render_value( $attributes, $block ) {
	$meta_key = isset( $attributes['metaKey'] ) && is_string( $attributes['metaKey'] ) ? $attributes['metaKey'] : '';
	$post_id  = magic_block_meta_resolve_post_id( $block );

	if ( '' !== $meta_key && $post_id ) {
		return magic_block_meta_get_post_meta_value( $post_id, $meta_key );
	}

	return isset( $attributes['value'] ) && is_scalar( $attributes['value'] ) ? trim( (string) $attributes['value'] ) : '';
}

/**
 * Resolve field registration details for a selected meta key.
 *
 * @param string $post_type Post type.
 * @param string $meta_key  Meta key.
 * @return array<string, mixed>|null
 */
function magic_block_meta_get_field_definition( $post_type, $meta_key ) {
	$post_type = is_string( $post_type ) ? $post_type : '';
	$meta_key  = is_string( $meta_key ) ? $meta_key : '';

	if ( '' === $post_type || '' === $meta_key ) {
		return null;
	}

	$field_map = magic_block_meta_get_supported_fields();
	$fields    = isset( $field_map[ $post_type ] ) && is_array( $field_map[ $post_type ] ) ? $field_map[ $post_type ] : array();

	foreach ( $fields as $field ) {
		if ( ! empty( $field['value'] ) && $meta_key === $field['value'] ) {
			return $field;
		}
	}

	return null;
}


/**
 * Resolve how a meta field block should behave when editing and rendering.
 *
 * @param array    $attributes Block attributes.
 * @param WP_Block $block      Parsed block instance.
 * @return string
 */
function magic_block_meta_resolve_field_mode( $attributes, $block ) {
	$field_mode = isset( $attributes['fieldMode'] ) && is_string( $attributes['fieldMode'] ) ? $attributes['fieldMode'] : 'auto';
	$meta_key   = isset( $attributes['metaKey'] ) && is_string( $attributes['metaKey'] ) ? $attributes['metaKey'] : '';
	$post_id    = magic_block_meta_resolve_post_id( $block );
	$post_type  = $post_id ? get_post_type( $post_id ) : '';
	$field      = magic_block_meta_get_field_definition( $post_type, $meta_key );

	if ( in_array( $field_mode, array( 'single', 'content' ), true ) ) {
		return $field_mode;
	}

	if ( '' === $meta_key || ! $post_id ) {
		return 'single';
	}

	if ( ! empty( $field['multiline'] ) ) {
		return 'content';
	}

	return 'single';
}

/**
 * Render the selected meta value on the frontend.
 *
 * @param array    $attributes Block attributes.
 * @param string   $content    Saved block content.
 * @param WP_Block $block      Parsed block instance.
 * @return string
 */
function magic_block_meta_render_block( $attributes, $content, $block ) {
	unset( $content );

	$value      = magic_block_meta_get_render_value( $attributes, $block );
	$field_mode = magic_block_meta_resolve_field_mode( $attributes, $block );

	if ( '' === $value ) {
		return '';
	}

	if ( 'content' === $field_mode ) {
		return sprintf(
			'<div %1$s>%2$s</div>',
			get_block_wrapper_attributes(),
			wpautop( esc_html( $value ) )
		);
	}

	return sprintf(
		'<p %1$s>%2$s</p>',
		get_block_wrapper_attributes(),
		esc_html( $value )
	);
}

/**
 * Render a conditional wrapper for nested blocks.
 *
 * @param array    $attributes Block attributes.
 * @param string   $content    Rendered inner block content.
 * @param WP_Block $block      Parsed block instance.
 * @return string
 */
function magic_block_meta_render_conditional_block( $attributes, $content, $block ) {
	$meta_key  = isset( $attributes['metaKey'] ) && is_string( $attributes['metaKey'] ) ? $attributes['metaKey'] : '';
	$hide_when = isset( $attributes['hideWhen'] ) && is_string( $attributes['hideWhen'] ) ? $attributes['hideWhen'] : 'empty';

	if ( '' !== $meta_key && 'empty' === $hide_when ) {
		$value = magic_block_meta_get_post_meta_value( magic_block_meta_resolve_post_id( $block ), $meta_key );

		if ( '' === $value ) {
			return '';
		}
	}

	return sprintf(
		'<div %1$s>%2$s</div>',
		get_block_wrapper_attributes(),
		$content
	);
}

/**
 * Return the public REST-enabled taxonomies that can be displayed by the terms block.
 *
 * @return array<string, WP_Taxonomy>
 */
function magic_block_meta_get_supported_taxonomies() {
	$taxonomies = get_taxonomies(
		array(
			'publicly_queryable' => true,
			'show_in_rest'       => true,
		),
		'objects'
	);

	return array_filter(
		$taxonomies,
		static function ( $taxonomy ) {
			return $taxonomy instanceof WP_Taxonomy;
		}
	);
}

/**
 * Build inserter variations for the custom post terms block.
 *
 * @return array<int, array<string, mixed>>
 */
function magic_block_meta_build_post_terms_variations() {
	$taxonomies        = magic_block_meta_get_supported_taxonomies();
	$built_in          = array();
	$custom_variations = array();

	foreach ( $taxonomies as $taxonomy ) {
		$variation = array(
			'name'        => $taxonomy->name,
			'title'       => sprintf(
				/* translators: %s: taxonomy label. */
				__( 'Magic Meta Blocks: %s', 'magic-block-meta' ),
				$taxonomy->label
			),
			'description' => sprintf(
				/* translators: %s: taxonomy label. */
				__( 'Display and edit assigned terms from the taxonomy: %s', 'magic-block-meta' ),
				$taxonomy->label
			),
			'attributes'  => array(
				'term' => $taxonomy->name,
			),
			'isActive'    => array( 'term' ),
			'scope'       => array( 'inserter', 'transform' ),
		);

		if ( 'category' === $taxonomy->name ) {
			$variation['isDefault'] = true;
		}

		if ( $taxonomy->_builtin ) {
			$built_in[] = $variation;
		} else {
			$custom_variations[] = $variation;
		}
	}

	return array_merge( $built_in, $custom_variations );
}

/**
 * Render the selected post terms on the frontend.
 *
 * @param array    $attributes Block attributes.
 * @param string   $content    Saved block content.
 * @param WP_Block $block      Parsed block instance.
 * @return string
 */
function magic_block_meta_render_post_terms_block( $attributes, $content, $block ) {
	unset( $content );

	if ( ! $block instanceof WP_Block || empty( $block->context['postId'] ) || empty( $attributes['term'] ) ) {
		return '';
	}

	$taxonomy = is_string( $attributes['term'] ) ? $attributes['term'] : '';

	if ( '' === $taxonomy || ! is_taxonomy_viewable( $taxonomy ) ) {
		return '';
	}

	$post_id = absint( $block->context['postId'] );
	$terms   = get_the_terms( $post_id, $taxonomy );

	if ( is_wp_error( $terms ) || empty( $terms ) ) {
		return '';
	}

	$classes = array(
		'wp-block-post-terms',
		'taxonomy-' . $taxonomy,
	);

	if ( ! empty( $attributes['textAlign'] ) && is_string( $attributes['textAlign'] ) ) {
		$classes[] = 'has-text-align-' . $attributes['textAlign'];
	}

	if ( isset( $attributes['style']['elements']['link']['color']['text'] ) ) {
		$classes[] = 'has-link-color';
	}

	$separator = isset( $attributes['separator'] ) && '' !== $attributes['separator'] ? $attributes['separator'] : ', ';
	$is_link   = ! isset( $attributes['isLink'] ) || (bool) $attributes['isLink'];
	$prefix    = '';
	$suffix    = '';

	if ( ! empty( $attributes['prefix'] ) && is_string( $attributes['prefix'] ) ) {
		$prefix = '<span class="wp-block-post-terms__prefix">' . esc_html( $attributes['prefix'] ) . '</span>';
	}

	if ( ! empty( $attributes['suffix'] ) && is_string( $attributes['suffix'] ) ) {
		$suffix = '<span class="wp-block-post-terms__suffix">' . esc_html( $attributes['suffix'] ) . '</span>';
	}

	$items = array_map(
		static function ( $term ) use ( $is_link ) {
			$label = esc_html( $term->name );

			if ( ! $is_link ) {
				return $label;
			}

			$url = get_term_link( $term );

			if ( is_wp_error( $url ) ) {
				return $label;
			}

			return sprintf(
				'<a href="%1$s" rel="tag">%2$s</a>',
				esc_url( $url ),
				$label
			);
		},
		$terms
	);

	$separator_markup   = '<span class="wp-block-post-terms__separator">' . esc_html( $separator ) . '</span>';
	$wrapper_attributes = get_block_wrapper_attributes(
		array(
			'class' => implode( ' ', $classes ),
		)
	);

	return sprintf(
		'<div %1$s>%2$s%3$s%4$s</div>',
		$wrapper_attributes,
		$prefix,
		implode( $separator_markup, $items ),
		$suffix
	);
}

/**
 * Render nothing for the editor-only placeholder block.
 *
 * @param array    $attributes Block attributes.
 * @param string   $content    Saved block content.
 * @param WP_Block $block      Parsed block instance.
 * @return string
 */
function magic_block_meta_render_placeholder_block( $attributes, $content, $block ) {
	unset( $attributes, $content, $block );

	return '';
}

// Load Plugin Update Checker with error handling.
$update_checker_file = MAGIC_BLOCK_META_DIR . 'vendor/plugin-update-checker/plugin-update-checker.php';
if ( file_exists( $update_checker_file ) ) {
	require $update_checker_file;

	if ( class_exists( 'Puc_v4_Factory' ) ) {
		$update_checker = Puc_v4_Factory::buildUpdateChecker(
			'https://github.com/jonschr/magic-block-meta',
			__FILE__,
			'magic-block-meta'
		);

		// Set the branch that contains the stable release.
		if ( method_exists( $update_checker, 'setBranch' ) ) {
			$update_checker->setBranch( 'master' );
		}
	}
}
