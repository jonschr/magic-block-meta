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
	const runtime = window.magicBlockMetaRuntime || ( window.magicBlockMetaRuntime = { dirtyByEntity: {} } );
	const ButtonBlockAppender = InnerBlocks.ButtonBlockAppender;

	if ( addFilter ) {
		addFilter(
			'editor.postContentBlockTypes',
			'magic-block-meta/post-content-blocks',
			function ( blockTypes ) {
				const nextTypes = Array.isArray( blockTypes ) ? blockTypes.slice() : [];

				if ( ! nextTypes.includes( 'magic/block-meta' ) ) {
					nextTypes.push( 'magic/block-meta' );
				}

				return nextTypes;
			}
		);
	}

	function getFieldsForPostType( postType, fieldType ) {
		if ( ! postType || ! fieldMap[ postType ] ) {
			return [];
		}

		const fields = fieldMap[ postType ];

		if ( ! fieldType ) {
			return fields;
		}

		return fields.filter( function ( field ) {
			return fieldType === field.type;
		} );
	}

	function isTextField( field ) {
		return !! field && 'text' === field.type;
	}

	function buildFieldOptions( fields ) {
		return [
			{ label: __( 'Select a field', 'magic-block-meta' ), value: '' },
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
			{ label: __( 'Select a post type', 'magic-block-meta' ), value: '' },
			...Object.keys( fieldMap ).map( function ( postType ) {
				return {
					label: postType,
					value: postType,
				};
			} ),
		];
	}

	function buildTemplatePostTypeOptions( defaultPostType ) {
		const baseOptions = buildPostTypeOptions();

		if ( ! defaultPostType ) {
			return baseOptions;
		}

		return [
			{
				label: sprintf( __( 'Follow current context (%s)', 'magic-block-meta' ), defaultPostType ),
				value: '',
			},
			...baseOptions.filter( function ( option ) {
				return '' !== option.value;
			} ),
		];
	}

	function buildHideWhenOptions() {
		return [
			{
				label: __( 'Meta value is empty', 'magic-block-meta' ),
				value: 'empty',
			},
		];
	}

	function buildFieldModeOptions( selectedField ) {
		if ( ! isTextField( selectedField ) ) {
			return [];
		}

		const autoLabel = selectedField
			? selectedField.multiline
				? __( 'Auto (Content area)', 'magic-block-meta' )
				: __( 'Auto (Single line)', 'magic-block-meta' )
			: __( 'Auto', 'magic-block-meta' );

		return [
			{
				label: autoLabel,
				value: 'auto',
			},
			{
				label: __( 'Single line', 'magic-block-meta' ),
				value: 'single',
			},
			{
				label: __( 'Content area', 'magic-block-meta' ),
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

	function inferTemplatePostType( templateReference ) {
		if ( ! templateReference || 'string' !== typeof templateReference ) {
			return '';
		}

		const templateSlug = templateReference.includes( '//' )
			? templateReference.split( '//' ).pop()
			: templateReference;

		if ( ! templateSlug || 'string' !== typeof templateSlug ) {
			return '';
		}

		if ( templateSlug.indexOf( 'single-' ) === 0 ) {
			return templateSlug.replace( 'single-', '' );
		}

		if ( templateSlug.indexOf( 'archive-' ) === 0 ) {
			return templateSlug.replace( 'archive-', '' );
		}

		if ( 'single' === templateSlug ) {
			return 'post';
		}

		if ( 'page' === templateSlug ) {
			return 'page';
		}

		return '';
	}

	function getContextPostType( context ) {
		const contextPostType =
			context && 'string' === typeof context.postType ? context.postType : '';

		if (
			! contextPostType ||
			'wp_template' === contextPostType ||
			'wp_template_part' === contextPostType
		) {
			return '';
		}

		return contextPostType;
	}

	function getEntityKey( postType, postId ) {
		if ( ! postType || ! postId ) {
			return '';
		}

		return postType + ':' + postId;
	}

	function markDirtyMetaValue( postType, postId, metaKey, value ) {
		const entityKey = getEntityKey( postType, postId );

		if ( ! entityKey || ! metaKey ) {
			return;
		}

		if ( ! runtime.dirtyByEntity[ entityKey ] ) {
			runtime.dirtyByEntity[ entityKey ] = {};
		}

		runtime.dirtyByEntity[ entityKey ][ metaKey ] = value;
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
				currentTemplateSlug:
					editorStore && editorStore.getEditedPostAttribute
						? editorStore.getEditedPostAttribute( 'slug' ) || ''
						: '',
			};
		}, [] );
	}

	function getResolvedPostType( editorContext, attributes, context ) {
		const isTemplateEditor = 'wp_template' === editorContext.postType;
		const inferredPostType =
			inferTemplatePostType(
				context && 'string' === typeof context.templateSlug ? context.templateSlug : ''
			) ||
			inferTemplatePostType( editorContext.currentTemplateSlug ) ||
			inferTemplatePostType( editorContext.currentTemplateId );
		const queryPostType =
			context && context.query && 'string' === typeof context.query.postType
				? context.query.postType
				: '';
		const previewPostType =
			context && 'string' === typeof context.previewPostType ? context.previewPostType : '';
		const contextPostType = getContextPostType( context );
		const contextualPostType = queryPostType || previewPostType || contextPostType || '';

		return {
			isTemplateEditor: isTemplateEditor,
			inferredPostType: inferredPostType,
			contextualPostType: contextualPostType,
			defaultPostType: contextualPostType || inferredPostType,
			resolvedPostType: isTemplateEditor
				? attributes.targetPostType || contextualPostType || inferredPostType
				: contextualPostType || editorContext.postType,
			canConfigureBinding: isTemplateEditor || !! contextualPostType,
		};
	}

	function renderCompactState( blockProps, resolvedFieldMode, title, messages ) {
		return createElement(
			'div',
			getFieldWrapperProps( blockProps, resolvedFieldMode || 'single' ),
			createElement( 'div', { className: 'magic-block-meta__placeholder' }, [
				createElement(
					'p',
					{
						key: 'title',
						className: 'magic-block-meta__placeholder-title',
					},
					title
				),
				...messages.map( function ( message, index ) {
					return createElement(
						'p',
						{
							key: 'message-' + index,
							className: 'magic-block-meta__placeholder-text',
						},
						message
					);
				} ),
			] )
		);
	}

	function renderTemplateNotice( blockProps, resolvedPostType, hasField, title ) {
		return renderCompactState(
			blockProps,
			'single',
			title,
			[
				resolvedPostType
					? sprintf(
							__( 'Using `%s` fields.', 'magic-block-meta' ),
							resolvedPostType
					  )
					: __( 'Select a target post type to see available fields.', 'magic-block-meta' ),
				hasField
					? __( 'This block will render that field on the front end.', 'magic-block-meta' )
					: __( 'Choose a field in block settings.', 'magic-block-meta' ),
			]
		);
	}

	function getFieldWrapperProps( blockProps, resolvedFieldMode ) {
		return Object.assign( {}, blockProps, {
			className: [
				blockProps.className,
				'content' === resolvedFieldMode ? 'magic-block-meta--content' : 'magic-block-meta--single',
			]
				.filter( Boolean )
				.join( ' ' ),
		} );
	}

	function renderLockedFieldPreview( blockProps, selectedField, metaKey, resolvedFieldMode ) {
		return createElement(
			'div',
			getFieldWrapperProps( blockProps, resolvedFieldMode ),
			createElement(
				'p',
				{
					className: 'magic-block-meta__value',
					style: {
						background: 'transparent',
					},
					'aria-label': selectedField ? selectedField.label : metaKey,
				},
				selectedField ? selectedField.label : metaKey
			)
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
				__( 'Choose a meta field in the block settings to control when this region renders on the front end.', 'magic-block-meta' )
			);
		}

		return null;
	}

	function renderFieldSettings( attributes, setAttributes, isTemplateEditor, defaultPostType, fields, selectedField, title, showFieldMode, options ) {
		const fieldHelp =
			options && options.fieldHelp
				? options.fieldHelp
				: __(
						'Choose one of the supported meta fields for this post type.',
						'magic-block-meta'
				  );
		const emptyFieldHelp =
			options && options.emptyFieldHelp
				? options.emptyFieldHelp
				: __(
						'No compatible meta fields are available for the selected post type.',
						'magic-block-meta'
				  );

		return createElement(
			PanelBody,
			{
				title: title,
				initialOpen: true,
			},
			isTemplateEditor
				? createElement( SelectControl, {
						label: __( 'Target Post Type', 'magic-block-meta' ),
						value: attributes.targetPostType || '',
						options: buildTemplatePostTypeOptions( defaultPostType ),
						onChange: function ( nextPostType ) {
							setAttributes( {
								targetPostType: nextPostType,
								metaKey: '',
							} );
						},
						help: __(
							'Leave this on the current context to follow the template or loop automatically, or choose a specific post type to override it.',
							'magic-block-meta'
						),
				  } )
				: null,
			createElement( SelectControl, {
				label: __( 'Field', 'magic-block-meta' ),
				value: attributes.metaKey || '',
				options: buildFieldOptions( fields ),
				onChange: function ( nextMetaKey ) {
					setAttributes( {
						metaKey: nextMetaKey,
					} );
				},
				help: fields.length > 0 ? fieldHelp : emptyFieldHelp,
			} ),
			showFieldMode
				? createElement( SelectControl, {
						label: __( 'Field Mode', 'magic-block-meta' ),
						value: attributes.fieldMode || 'auto',
						options: buildFieldModeOptions( selectedField ),
						onChange: function ( nextFieldMode ) {
							setAttributes( {
								fieldMode: nextFieldMode,
							} );
						},
						help: __(
							'Auto follows the registered meta field. Content area uses Enter for paragraphs and Shift+Enter for line breaks.',
							'magic-block-meta'
						),
				  } )
				: null
		);
	}

	registerBlockType( 'magic/block-meta', {
		edit: function ( props ) {
			const attributes = props.attributes;
			const setAttributes = props.setAttributes;
			const blockProps = useBlockProps();

			const editorContext = useEditorContext();
			const resolved = getResolvedPostType( editorContext, attributes, props.context || {} );
			const isTemplateEditor = resolved.isTemplateEditor;
			const defaultPostType = resolved.defaultPostType;
			const resolvedPostType = resolved.resolvedPostType;
			const canConfigureBinding = resolved.canConfigureBinding;
			const fields = getFieldsForPostType( resolvedPostType, 'text' );
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
			const metaValue =
				attributes.metaKey && 'string' === typeof meta[ attributes.metaKey ]
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
					} )
				);

				markDirtyMetaValue( resolvedPostType, editorContext.postId, attributes.metaKey, cleanValue );
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
							defaultPostType,
							fields,
							selectedField,
							__( 'Magic Meta Field: Text', 'magic-block-meta' ),
							true,
							{
								fieldHelp: __(
									'Choose one of the registered plain-text meta fields for this post type.',
									'magic-block-meta'
								),
								emptyFieldHelp: __(
									'No compatible text meta fields are available for the selected post type.',
									'magic-block-meta'
								),
							}
						)
					)
					: null,
				! attributes.metaKey
					? ( isTemplateEditor
						? renderTemplateNotice( blockProps, resolvedPostType, false, __( 'Magic Meta Field: Text', 'magic-block-meta' ) )
						: renderCompactState(
							blockProps,
							resolvedFieldMode,
							__( 'Magic Meta Field: Text', 'magic-block-meta' ),
							[
								fields.length > 0
									? sprintf(
											__( '%d fields available for this post type.', 'magic-block-meta' ),
											fields.length
									  )
									: __(
											'No compatible text meta fields are currently registered for this post type.',
											'magic-block-meta'
									  ),
								__( 'Choose a field in block settings.', 'magic-block-meta' ),
							]
						  ) )
					: ! canEditInline
						? renderLockedFieldPreview( blockProps, selectedField, attributes.metaKey, resolvedFieldMode )
						: createElement(
							'div',
							getFieldWrapperProps( blockProps, resolvedFieldMode ),
							createElement( RichText, {
								tagName: 'content' === resolvedFieldMode ? 'div' : 'p',
								className: 'magic-block-meta__value',
								value: editorValue,
								onChange: updateMetaValue,
								placeholder: selectedField ? selectedField.label : attributes.metaKey,
								allowedFormats: [],
								withoutInteractiveFormatting: true,
								identifier: 'value',
								disableLineBreaks: 'single' === resolvedFieldMode,
								multiline: 'content' === resolvedFieldMode ? 'p' : undefined,
								style: {
									background: 'transparent',
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

	registerBlockType( 'magic/block-meta-conditional', {
		edit: function ( props ) {
			const attributes = props.attributes;
			const setAttributes = props.setAttributes;
			const blockProps = useBlockProps( {
				className: 'magic-block-meta-conditional',
			} );

			const editorContext = useEditorContext();
			const resolved = getResolvedPostType( editorContext, attributes, props.context || {} );
			const isTemplateEditor = resolved.isTemplateEditor;
			const defaultPostType = resolved.defaultPostType;
			const resolvedPostType = resolved.resolvedPostType;
			const canConfigureBinding = resolved.canConfigureBinding;
			const fields = getFieldsForPostType( resolvedPostType, 'text' );
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
								defaultPostType,
								fields,
								selectedField,
								__( 'Meta Field Conditional', 'magic-block-meta' ),
								false,
								{
									fieldHelp: __(
										'Choose one of the supported text meta fields for this post type.',
										'magic-block-meta'
									),
									emptyFieldHelp: __(
										'No compatible text meta fields are available for the selected post type.',
										'magic-block-meta'
									),
								}
							),
							createElement(
								PanelBody,
								{
									title: __( 'Display Rules', 'magic-block-meta' ),
									initialOpen: true,
								},
								createElement( SelectControl, {
									label: __( 'Hide when', 'magic-block-meta' ),
									value: attributes.hideWhen || 'empty',
									options: buildHideWhenOptions(),
									onChange: function ( nextHideWhen ) {
										setAttributes( {
											hideWhen: nextHideWhen,
										} );
									},
									help: __(
										'Front end only. This block always stays visible while editing.',
										'magic-block-meta'
									),
								} )
							)
						)
					)
					: null,
				! attributes.metaKey
					? createElement(
						'div',
						innerBlocksProps,
						[
							renderConditionalTemplateNotice( selectedField, attributes.metaKey ),
							innerBlocksProps.children,
						]
					)
					: createElement( 'div', innerBlocksProps, innerBlocksProps.children )
			);
		},
		save: function () {
			return createElement( InnerBlocks.Content );
		},
	} );
} )( window.wp, window.magicBlockMetaSettings || {} );
