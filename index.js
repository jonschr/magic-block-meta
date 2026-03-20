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
	const InspectorControls = wp.blockEditor.InspectorControls;
	const RichText = wp.blockEditor.RichText;
	const InnerBlocks = wp.blockEditor.InnerBlocks;
	const useInnerBlocksProps = wp.blockEditor.useInnerBlocksProps;
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
	const ButtonBlockAppender = InnerBlocks.ButtonBlockAppender;
	if ( addFilter ) {
		addFilter(
			'editor.postContentBlockTypes',
			'elodin-block-meta/post-content-blocks',
			function ( blockTypes ) {
				const nextTypes = Array.isArray( blockTypes ) ? blockTypes.slice() : [];

				[ 'elodin/block-meta' ].forEach( function ( blockName ) {
					if ( ! nextTypes.includes( blockName ) ) {
						nextTypes.push( blockName );
					}
				} );

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

	function buildHideWhenOptions() {
		return [
			{
				label: __( 'Meta value is empty', 'elodin-block-meta' ),
				value: 'empty',
			},
		];
	}

	function buildFieldModeOptions( selectedField ) {
		const autoLabel = selectedField
			? selectedField.multiline
				? __( 'Auto (Content area)', 'elodin-block-meta' )
				: __( 'Auto (Single line)', 'elodin-block-meta' )
			: __( 'Auto', 'elodin-block-meta' );

		return [
			{
				label: autoLabel,
				value: 'auto',
			},
			{
				label: __( 'Single line', 'elodin-block-meta' ),
				value: 'single',
			},
			{
				label: __( 'Content area', 'elodin-block-meta' ),
				value: 'content',
			},
		];
	}

	function resolveFieldMode( selectedField, fieldMode ) {
		if ( 'single' === fieldMode || 'content' === fieldMode ) {
			return fieldMode;
		}

		return selectedField && selectedField.multiline ? 'content' : 'single';
	}

	function escapeHtml( value ) {
		return String( value )
			.replace( /&/g, '&amp;' )
			.replace( /</g, '&lt;' )
			.replace( />/g, '&gt;' )
			.replace( /"/g, '&quot;' )
			.replace( /'/g, '&#039;' );
	}

	function plainTextToRichTextValue( value ) {
		const normalizedValue = 'string' === typeof value ? value.replace( /\r\n?/g, '\n' ).trim() : '';

		if ( ! normalizedValue ) {
			return '';
		}

		return normalizedValue
			.split( /\n{2,}/ )
			.map( function ( paragraph ) {
				return '<p>' + escapeHtml( paragraph ).replace( /\n/g, '<br>' ) + '</p>';
			} )
			.join( '' );
	}

	function richTextValueToPlainText( value ) {
		if ( ! value ) {
			return '';
		}

		if ( 'string' !== typeof value ) {
			return String( value );
		}

		if ( 'undefined' === typeof window || ! window.document || ! window.Node ) {
			return value
				.replace( /<br\s*\/?>(?=.)/gi, '\n' )
				.replace( /<\/p>\s*<p>/gi, '\n\n' )
				.replace( /<[^>]+>/g, '' )
				.trim();
		}

		const container = window.document.createElement( 'div' );
		container.innerHTML = value;

		const paragraphs = Array.from( container.childNodes ).map( function ( node ) {
			if ( node.nodeType === window.Node.TEXT_NODE ) {
				return node.textContent || '';
			}

			if ( node.nodeType !== window.Node.ELEMENT_NODE ) {
				return '';
			}

			const clone = node.cloneNode( true );
			clone.querySelectorAll( 'br' ).forEach( function ( br ) {
				br.replaceWith( '\n' );
			} );

			return clone.textContent || '';
		} );

		return paragraphs.join( '\n\n' ).replace( /\n{3,}/g, '\n\n' ).trim();
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

	function useEditorContext() {
		return useSelect( function ( select ) {
			const editorStore = select( 'core/editor' );

			return {
				postType:
					editorStore && editorStore.getCurrentPostType
						? editorStore.getCurrentPostType()
						: null,
				postId:
					editorStore && editorStore.getCurrentPostId
						? editorStore.getCurrentPostId()
						: null,
				currentTemplateId:
					editorStore && editorStore.getCurrentTemplateId
						? editorStore.getCurrentTemplateId()
						: '',
			};
		}, [] );
	}

	function getResolvedPostType( editorContext, attributes, context ) {
		const isTemplateEditor = 'wp_template' === editorContext.postType;
		const inferredPostType = inferTemplatePostType( editorContext.currentTemplateId );
		const queryPostType =
			context && context.query && 'string' === typeof context.query.postType
				? context.query.postType
				: '';
		const previewPostType =
			context && 'string' === typeof context.previewPostType ? context.previewPostType : '';
		const contextualPostType = queryPostType || previewPostType || '';

		return {
			isTemplateEditor: isTemplateEditor,
			inferredPostType: inferredPostType,
			contextualPostType: contextualPostType,
			resolvedPostType: isTemplateEditor
				? attributes.targetPostType || contextualPostType || inferredPostType
				: contextualPostType || editorContext.postType,
			canConfigureBinding: isTemplateEditor || !! contextualPostType,
		};
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

	function renderLockedFieldPreview( blockProps, selectedField, metaKey ) {
		return createElement(
			'p',
			{
				...blockProps,
				className:
					( blockProps.className ? blockProps.className + ' ' : '' ) + 'elodin-block-meta__value',
				style: Object.assign( {}, blockProps.style || {}, {
					background: 'transparent',
					padding: blockProps.style && undefined !== blockProps.style.padding ? blockProps.style.padding : 0,
					margin: blockProps.style && undefined !== blockProps.style.margin ? blockProps.style.margin : 0,
				} ),
				'aria-label': selectedField ? selectedField.label : metaKey,
			},
			selectedField ? selectedField.label : metaKey
		);
	}

	function renderConditionalTemplateNotice( selectedField, metaKey ) {
		const fieldLabel = selectedField ? selectedField.label : metaKey;

		if ( ! fieldLabel ) {
			return createElement(
				Notice,
				{
					status: 'warning',
					isDismissible: false,
				},
				__( 'Choose a meta field in the block settings to control when this region renders on the front end.', 'elodin-block-meta' )
			);
		}

		return null;
	}

	function renderFieldSettings( attributes, setAttributes, isTemplateEditor, inferredPostType, fields, selectedField, title, showFieldMode ) {
		return createElement(
			PanelBody,
			{
				title: title,
				initialOpen: true,
			},
			isTemplateEditor
				? createElement( SelectControl, {
						label: __( 'Target Post Type', 'elodin-block-meta' ),
						value: attributes.targetPostType || inferredPostType,
						options: buildPostTypeOptions(),
						onChange: function ( nextPostType ) {
							setAttributes( {
								targetPostType: nextPostType,
								metaKey: '',
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
			} ),
			showFieldMode
				? createElement( SelectControl, {
						label: __( 'Field Mode', 'elodin-block-meta' ),
						value: attributes.fieldMode || 'auto',
						options: buildFieldModeOptions( selectedField ),
						onChange: function ( nextFieldMode ) {
							setAttributes( {
								fieldMode: nextFieldMode,
							} );
						},
						help: __(
							'Auto follows the registered meta field. Content area uses Enter for paragraphs and Shift+Enter for line breaks.',
							'elodin-block-meta'
						),
				  } )
				: null
		);
	}

	registerBlockType( 'elodin/block-meta', {
		edit: function ( props ) {
			const attributes = props.attributes;
			const setAttributes = props.setAttributes;
			const blockProps = useBlockProps();

			const editorContext = useEditorContext();
			const resolved = getResolvedPostType( editorContext, attributes, props.context || {} );
			const isTemplateEditor = resolved.isTemplateEditor;
			const inferredPostType = resolved.inferredPostType;
			const resolvedPostType = resolved.resolvedPostType;
			const canConfigureBinding = resolved.canConfigureBinding;
			const fields = getFieldsForPostType( resolvedPostType );
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
			const resolvedFieldMode = resolveFieldMode( selectedField, attributes.fieldMode || 'auto' );
			const editorValue =
				'content' === resolvedFieldMode ? plainTextToRichTextValue( metaValue ) : metaValue;
			const canEditInline = !! (
				attributes.metaKey &&
				resolvedPostType &&
				editorContext.postId &&
				editorContext.postType === resolvedPostType
			);

			function updateMetaValue( nextValue ) {
				const cleanValue = richTextValueToPlainText( nextValue || '' );

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
				canConfigureBinding
					? createElement(
						InspectorControls,
						null,
						renderFieldSettings(
							attributes,
							setAttributes,
							isTemplateEditor,
							inferredPostType,
							fields,
							selectedField,
							__( 'Meta Field', 'elodin-block-meta' ),
							true
						)
					)
					: null,
				! attributes.metaKey
					? ( isTemplateEditor
						? renderTemplateNotice( blockProps, resolvedPostType, false )
						: createElement(
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
						  ) )
					: ! canEditInline
						? renderLockedFieldPreview( blockProps, selectedField, attributes.metaKey )
						: createElement( RichText, {
									...blockProps,
									tagName: 'content' === resolvedFieldMode ? 'div' : 'p',
									className:
										( blockProps.className ? blockProps.className + ' ' : '' ) + 'elodin-block-meta__value',
									value: editorValue,
									onChange: updateMetaValue,
									placeholder: selectedField ? selectedField.label : attributes.metaKey,
									allowedFormats: [],
									withoutInteractiveFormatting: true,
									identifier: 'value',
									disableLineBreaks: 'single' === resolvedFieldMode,
									multiline: 'content' === resolvedFieldMode ? 'p' : undefined,
									style: Object.assign( {}, blockProps.style || {}, {
										background: 'transparent',
										padding: blockProps.style && undefined !== blockProps.style.padding ? blockProps.style.padding : 0,
										margin: blockProps.style && undefined !== blockProps.style.margin ? blockProps.style.margin : 0,
									} ),
									'aria-label': selectedField ? selectedField.label : attributes.metaKey,
								} )
			);
		},
		save: function () {
			return null;
		},
	} );

	registerBlockType( 'elodin/block-meta-conditional', {
		edit: function ( props ) {
			const attributes = props.attributes;
			const setAttributes = props.setAttributes;
			const blockProps = useBlockProps( {
				className: 'elodin-block-meta-conditional',
			} );

			const editorContext = useEditorContext();
			const resolved = getResolvedPostType( editorContext, attributes, props.context || {} );
			const isTemplateEditor = resolved.isTemplateEditor;
			const inferredPostType = resolved.inferredPostType;
			const resolvedPostType = resolved.resolvedPostType;
			const canConfigureBinding = resolved.canConfigureBinding;
			const fields = getFieldsForPostType( resolvedPostType );
			const selectedField =
				fields.find( function ( field ) {
					return field.value === attributes.metaKey;
				} ) || null;
			const hasInnerBlocks = useSelect(
				function ( select ) {
					const blockEditorStore = select( 'core/block-editor' );
					const innerBlockOrder =
						blockEditorStore && blockEditorStore.getBlockOrder
							? blockEditorStore.getBlockOrder( props.clientId )
							: [];

					return innerBlockOrder.length > 0;
				},
				[ props.clientId ]
			);
			const innerBlocksProps = useInnerBlocksProps(
				blockProps,
				{
					renderAppender: hasInnerBlocks ? undefined : ButtonBlockAppender,
					templateLock: false,
				}
			);

			return createElement(
				Fragment,
				null,
				canConfigureBinding
					? createElement(
						InspectorControls,
						null,
						createElement(
							Fragment,
							null,
							renderFieldSettings(
								attributes,
								setAttributes,
								isTemplateEditor,
								inferredPostType,
								fields,
								selectedField,
								__( 'Meta Field Conditional', 'elodin-block-meta' ),
								false
							),
							createElement(
								PanelBody,
								{
									title: __( 'Display Rules', 'elodin-block-meta' ),
									initialOpen: true,
								},
								createElement( SelectControl, {
									label: __( 'Hide when', 'elodin-block-meta' ),
									value: attributes.hideWhen || 'empty',
									options: buildHideWhenOptions(),
									onChange: function ( nextHideWhen ) {
										setAttributes( {
											hideWhen: nextHideWhen,
										} );
									},
									help: __(
										'Front end only. This block always stays visible while editing.',
										'elodin-block-meta'
									),
								} )
							)
						)
					)
					: null,
				createElement(
					'div',
					innerBlocksProps,
					isTemplateEditor ? renderConditionalTemplateNotice( selectedField, attributes.metaKey ) : null,
					innerBlocksProps.children
				)
			);
		},
		save: function () {
			return createElement( InnerBlocks.Content );
		},
	} );
} )( window.wp, window.elodinBlockMetaSettings || {} );
