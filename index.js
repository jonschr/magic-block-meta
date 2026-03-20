( function ( wp, settings ) {
	if (
		! wp ||
		! wp.blocks ||
		! wp.blockEditor ||
		! wp.components ||
		! wp.coreData ||
		! wp.data
	) {
		return;
	}

	const registerBlockType = wp.blocks.registerBlockType;
	const useBlockProps = wp.blockEditor.useBlockProps;
	const useBlockEditingMode = wp.blockEditor.useBlockEditingMode;
	const InspectorControls = wp.blockEditor.InspectorControls;
	const RichText = wp.blockEditor.RichText;
	const PanelBody = wp.components.PanelBody;
	const Placeholder = wp.components.Placeholder;
	const SelectControl = wp.components.SelectControl;
	const Notice = wp.components.Notice;
	const useSelect = wp.data.useSelect;
	const useEntityProp = wp.coreData.useEntityProp;
	const addFilter = wp.hooks && wp.hooks.addFilter ? wp.hooks.addFilter : null;
	const createElement = wp.element.createElement;
	const Fragment = wp.element.Fragment;
	const __ = wp.i18n.__;
	const sprintf = wp.i18n.sprintf;

	const fieldMap = settings && settings.fields ? settings.fields : {};
	const overrideMetaKey = settings && settings.overrideMetaKey ? settings.overrideMetaKey : 'elodin_block_meta_overrides';

	if ( addFilter ) {
		addFilter(
			'editor.postContentBlockTypes',
			'elodin-block-meta/post-content-blocks',
			function ( blockTypes ) {
				const nextTypes = Array.isArray( blockTypes ) ? blockTypes.slice() : [];

				if ( ! nextTypes.includes( 'elodin/block-meta' ) ) {
					nextTypes.push( 'elodin/block-meta' );
				}

				return nextTypes;
			}
		);
	}

	function getFieldsForPostType( postType ) {
		if ( ! postType || ! fieldMap[ postType ] ) {
			return [];
		}

		return fieldMap[ postType ];
	}

	function buildFieldOptions( fields ) {
		return [
			{ label: __( 'Select a field', 'elodin-block-meta' ), value: '' },
			...fields.map( function ( field ) {
				return {
					label: field.label,
					value: field.value,
				};
			} ),
		];
	}

	function buildPostTypeOptions() {
		return [
			{ label: __( 'Select a post type', 'elodin-block-meta' ), value: '' },
			...Object.keys( fieldMap ).map( function ( postType ) {
				return {
					label: postType,
					value: postType,
				};
			} ),
		];
	}

	function inferTemplatePostType( templateId ) {
		if ( ! templateId || 'string' !== typeof templateId ) {
			return '';
		}

		const templateSlug = templateId.includes( '//' )
			? templateId.split( '//' ).pop()
			: templateId;

		if ( ! templateSlug || 'string' !== typeof templateSlug ) {
			return '';
		}

		if ( templateSlug.indexOf( 'single-' ) === 0 ) {
			return templateSlug.replace( 'single-', '' );
		}

		if ( templateSlug.indexOf( 'archive-' ) === 0 ) {
			return templateSlug.replace( 'archive-', '' );
		}

		return '';
	}

	function getOverrideValue( meta, metaKey ) {
		if (
			! meta ||
			! metaKey ||
			! meta[ overrideMetaKey ] ||
			'object' !== typeof meta[ overrideMetaKey ] ||
			'string' !== typeof meta[ overrideMetaKey ][ metaKey ]
		) {
			return null;
		}

		return meta[ overrideMetaKey ][ metaKey ];
	}

	function useEditorContext( context ) {
		return useSelect(
			function ( select ) {
				const editorStore = select( 'core/editor' );
				const postType =
					editorStore && editorStore.getCurrentPostType
						? editorStore.getCurrentPostType()
						: null;
				const postId =
					editorStore && editorStore.getCurrentPostId
						? editorStore.getCurrentPostId()
						: null;
				const currentTemplateId =
					editorStore && editorStore.getCurrentTemplateId
						? editorStore.getCurrentTemplateId()
						: '';

				return {
					postType: context.postType || postType,
					postId: context.postId || postId,
					currentTemplateId: currentTemplateId,
				};
			},
			[ context.postId, context.postType ]
		);
	}

	function renderTemplateNotice( blockProps, resolvedPostType, hasField ) {
		return createElement(
			'div',
			blockProps,
			createElement(
				Placeholder,
				{
					label: __( 'Meta Field', 'elodin-block-meta' ),
					instructions: __(
						'Configure the target post type and field in the block settings.',
						'elodin-block-meta'
					),
				},
				createElement(
					'p',
					null,
					resolvedPostType
						? sprintf(
								__( 'Using fields registered for the `%s` post type.', 'elodin-block-meta' ),
								resolvedPostType
						  )
						: __(
								'Select a target post type to see available meta fields.',
								'elodin-block-meta'
						  )
				),
				createElement(
					'p',
					null,
					hasField
						? __( 'This block will render that field when viewing a post.', 'elodin-block-meta' )
						: __( 'Choose a field to link this block to a meta value.', 'elodin-block-meta' )
				)
			)
		);
	}

	registerBlockType( 'elodin/block-meta', {
		edit: function ( props ) {
			const attributes = props.attributes;
			const setAttributes = props.setAttributes;
			const blockProps = useBlockProps();
			useBlockEditingMode( 'contentOnly' );

			const editorContext = useEditorContext( props.context || {} );
			const isTemplateEditor = 'wp_template' === editorContext.postType;
			const inferredPostType = inferTemplatePostType( editorContext.currentTemplateId );
			const resolvedPostType = isTemplateEditor
				? attributes.targetPostType || inferredPostType
				: editorContext.postType;
			const fields = getFieldsForPostType( resolvedPostType );
				const postTypeOptions = buildPostTypeOptions();
				const selectedField =
					fields.find( function ( field ) {
						return field.value === attributes.metaKey;
					} ) || null;
				const metaValueTuple = useEntityProp(
					'postType',
					resolvedPostType || 'post',
				'meta',
				isTemplateEditor ? 0 : editorContext.postId || 0
			);
				const meta = metaValueTuple[ 0 ] || {};
				const setMeta = metaValueTuple[ 1 ];
				const overrideValue = getOverrideValue( meta, attributes.metaKey );
				const metaValue =
					null !== overrideValue
						? overrideValue
						: attributes.metaKey && 'string' === typeof meta[ attributes.metaKey ]
							? meta[ attributes.metaKey ]
						: '';

			function updateMetaValue( nextValue ) {
				const cleanValue = nextValue || '';

				setAttributes( {
					value: cleanValue,
				} );

				if ( isTemplateEditor || ! attributes.metaKey || ! resolvedPostType || ! editorContext.postId ) {
					return;
				}

					setMeta(
						Object.assign( {}, meta, {
							[ attributes.metaKey ]: cleanValue,
							[ overrideMetaKey ]: Object.assign(
								{},
								meta[ overrideMetaKey ] && 'object' === typeof meta[ overrideMetaKey ] ? meta[ overrideMetaKey ] : {},
								{
									[ attributes.metaKey ]: cleanValue,
								}
							),
						} )
					);
				}

			return createElement(
				Fragment,
				null,
				createElement(
					InspectorControls,
					null,
					createElement(
						PanelBody,
						{
							title: __( 'Meta Field', 'elodin-block-meta' ),
							initialOpen: true,
						},
						isTemplateEditor
							? createElement( SelectControl, {
									label: __( 'Target Post Type', 'elodin-block-meta' ),
									value: attributes.targetPostType || inferredPostType,
									options: postTypeOptions,
									onChange: function ( nextPostType ) {
										setAttributes( {
											targetPostType: nextPostType,
											metaKey: '',
											value: '',
										} );
									},
									help: __(
										'Used only while configuring this block in the template editor.',
										'elodin-block-meta'
									),
							  } )
							: null,
						createElement( SelectControl, {
							label: __( 'Field', 'elodin-block-meta' ),
							value: attributes.metaKey || '',
							options: buildFieldOptions( fields ),
							onChange: function ( nextMetaKey ) {
								setAttributes( {
									metaKey: nextMetaKey,
									value: '',
								} );
							},
							help:
								fields.length > 0
									? __(
											'Choose one of the registered plain-text meta fields for this post type.',
											'elodin-block-meta'
									  )
									: __(
											'No compatible text meta fields are available for the selected post type.',
											'elodin-block-meta'
									  ),
						} )
					)
				),
				isTemplateEditor
					? renderTemplateNotice( blockProps, resolvedPostType, !! attributes.metaKey )
					: ! attributes.metaKey
						? createElement(
								'div',
								blockProps,
								createElement(
									Placeholder,
									{
										label: __( 'Meta Field', 'elodin-block-meta' ),
										instructions: __(
											'Select a registered text meta field in the block settings.',
											'elodin-block-meta'
										),
									},
									createElement(
										'p',
										null,
										fields.length > 0
											? sprintf(
													__( '%d fields available for this post type.', 'elodin-block-meta' ),
													fields.length
											  )
											: __(
													'No compatible text meta fields are currently registered for this post type.',
													'elodin-block-meta'
											  )
									)
								)
						  )
						: ! resolvedPostType || ! editorContext.postId
							? createElement(
									'div',
									blockProps,
									createElement(
										Notice,
										{
											status: 'warning',
											isDismissible: false,
										},
											__( 'This block can only edit meta values while editing a post.', 'elodin-block-meta' )
										)
							  )
							: createElement(
									'div',
									blockProps,
									createElement( RichText, {
										tagName: 'div',
										className: 'elodin-block-meta__value',
										value: metaValue,
										onChange: updateMetaValue,
										placeholder: selectedField ? selectedField.label : attributes.metaKey,
										allowedFormats: [],
										withoutInteractiveFormatting: true,
										identifier: 'value',
										style: {
											background: 'transparent',
											padding: 0,
											margin: 0,
										},
										'aria-label': selectedField ? selectedField.label : attributes.metaKey,
									} )
							  )
			);
		},
		save: function () {
			return null;
		},
	} );
} )( window.wp, window.elodinBlockMetaSettings || {} );
