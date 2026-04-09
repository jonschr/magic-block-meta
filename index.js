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
	const useBlockEditingMode = wp.blockEditor.useBlockEditingMode;
	const RichText = wp.blockEditor.RichText;
	const InnerBlocks = wp.blockEditor.InnerBlocks;
	const useInnerBlocksProps = wp.blockEditor.useInnerBlocksProps;
	const PanelBody = wp.components.PanelBody;
	const SelectControl = wp.components.SelectControl;
	const ToggleControl = wp.components.ToggleControl;
	const Button = wp.components.Button;
	const Dropdown = wp.components.Dropdown;
	const CheckboxControl = wp.components.CheckboxControl;
	const Notice = wp.components.Notice;
	const TextControl = wp.components.TextControl;
	const TextareaControl = wp.components.TextareaControl;
	const useSelect = wp.data.useSelect;
	const useDispatch = wp.data.useDispatch;
	const useEntityProp = wp.coreData.useEntityProp;
	const addFilter = wp.hooks && wp.hooks.addFilter ? wp.hooks.addFilter : null;
	const createElement = wp.element.createElement;
	const Fragment = wp.element.Fragment;
	const useState = wp.element.useState;
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

				if ( ! nextTypes.includes( 'magic/block-meta-placeholder' ) ) {
					nextTypes.push( 'magic/block-meta-placeholder' );
				}

				if ( ! nextTypes.includes( 'magic/post-terms' ) ) {
					nextTypes.push( 'magic/post-terms' );
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

	function buildTaxonomyOptions( taxonomies ) {
		return [
			{ label: __( 'Select a taxonomy', 'magic-block-meta' ), value: '' },
			...( taxonomies || [] ).map( function ( taxonomy ) {
				const value = taxonomy.slug || taxonomy.name || '';

				return {
					label: taxonomy.label || taxonomy.name || value,
					value: value,
				};
			} ),
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
			canConfigureBinding: isTemplateEditor || !! ( contextualPostType || editorContext.postType ),
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

	function renderEditorOnlyTemplateNotice( blockProps, resolvedPostType, hasField, title ) {
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
					? __( 'This block edits that field in the editor and renders nothing on the front end.', 'magic-block-meta' )
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

	function renderPlaceholderFieldEditor( blockProps, selectedField, metaKey, value, onChange ) {
		const Control = selectedField && selectedField.multiline ? TextareaControl : TextControl;
		const fieldLabel = selectedField ? selectedField.label : metaKey;

		return createElement(
			'div',
			blockProps,
			createElement(
				'div',
				{
					className: 'magic-block-meta__placeholder',
				},
				createElement(
					'p',
					{
						className: 'magic-block-meta__placeholder-title',
					},
					fieldLabel
				),
				createElement( Control, {
					className: 'magic-block-meta__placeholder-control',
					label: fieldLabel,
					hideLabelFromVision: true,
					value: value || '',
					onChange: onChange,
					placeholder: fieldLabel,
					rows: selectedField && selectedField.multiline ? 4 : undefined,
				} )
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

	function renderTermsPreview( blockProps, options ) {
		const items = Array.isArray( options.items ) ? options.items.filter( Boolean ) : [];
		const separator = options.separator || ', ';
		const previewText =
			options.previewText || ( items.length > 0 ? items.join( separator ) : options.emptyText );

		return createElement(
			'div',
			blockProps,
			createElement( 'div', { className: 'magic-block-meta__placeholder' }, [
				createElement(
					'p',
					{
						key: 'title',
						className: 'magic-block-meta__placeholder-title',
					},
					previewText
				),
			] )
		);
	}

	function renderTermsEditor( blockProps, options ) {
		return createElement(
			'div',
			blockProps,
			createElement( 'div', { className: 'magic-block-meta__placeholder' }, [
				createElement(
					'p',
					{
						key: 'title',
						className: 'magic-block-meta__placeholder-title',
					},
					options.taxonomyLabel
				),
				createElement( Dropdown, {
					key: 'field',
					className: 'magic-post-terms__dropdown',
					popoverProps: {
						className: 'magic-post-terms__popover',
					},
					renderToggle: function ( toggleProps ) {
						return createElement(
							Button,
							{
								className: 'magic-post-terms__control',
								onClick: toggleProps.onToggle,
								'aria-expanded': !! toggleProps.isOpen,
								'aria-haspopup': 'true',
							},
							options.value.length > 0
								? options.value.join( ', ' )
								: __( 'Select terms', 'magic-block-meta' )
						);
					},
					renderContent: function () {
						return createElement(
							'div',
							{
								className: 'magic-post-terms__menu',
							},
							createElement( TextControl, {
								key: 'search',
								className: 'magic-post-terms__search',
								label: __( 'Search terms', 'magic-block-meta' ),
								hideLabelFromVision: true,
								value: options.query,
								onChange: options.onQueryChange,
								placeholder: __( 'Search terms', 'magic-block-meta' ),
								autoComplete: 'off',
							} ),
							options.items.length > 0
								? options.items.map( function ( item ) {
									return createElement( CheckboxControl, {
										key: item.id,
										className: 'magic-post-terms__option',
										label: item.label,
										checked: item.checked,
										onChange: function ( nextChecked ) {
											options.onToggle( item.id, nextChecked );
										},
									} );
								} )
								: createElement(
									'p',
									{
										className: 'magic-block-meta__placeholder-text',
									},
									options.query
										? __( 'No matching terms.', 'magic-block-meta' )
										: __( 'No terms available.', 'magic-block-meta' )
								)
						);
					},
				} ),
			] )
		);
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

	function renderTermsSettings( attributes, setAttributes, taxonomies, taxonomyObject ) {
		return createElement(
			Fragment,
			null,
			createElement(
				PanelBody,
				{
					title: __( 'Terms', 'magic-block-meta' ),
					initialOpen: true,
				},
				createElement( SelectControl, {
					label: __( 'Taxonomy', 'magic-block-meta' ),
					value: attributes.term || '',
					options: buildTaxonomyOptions( taxonomies ),
					onChange: function ( nextTerm ) {
						setAttributes( {
							term: nextTerm,
						} );
					},
					help:
						taxonomies.length > 0
							? __( 'Choose which taxonomy this block should display and edit for the current post.', 'magic-block-meta' )
							: __( 'No REST-enabled taxonomies are available for this post type.', 'magic-block-meta' ),
				} ),
				createElement( ToggleControl, {
					label: __( 'Link terms to archives', 'magic-block-meta' ),
					checked: false !== attributes.isLink,
					onChange: function ( nextIsLink ) {
						setAttributes( {
							isLink: nextIsLink,
						} );
					},
					help: __( 'Turn this off to output plain text instead of linked terms on the front end.', 'magic-block-meta' ),
					disabled: ! taxonomyObject,
				} ),
				createElement( TextControl, {
					label: __( 'Separator', 'magic-block-meta' ),
					value: attributes.separator || ', ',
					onChange: function ( nextSeparator ) {
						setAttributes( {
							separator: nextSeparator,
						} );
					},
					disabled: ! taxonomyObject,
				} ),
				createElement( TextControl, {
					label: __( 'Prefix', 'magic-block-meta' ),
					value: attributes.prefix || '',
					onChange: function ( nextPrefix ) {
						setAttributes( {
							prefix: nextPrefix,
						} );
					},
					disabled: ! taxonomyObject,
				} ),
				createElement( TextControl, {
					label: __( 'Suffix', 'magic-block-meta' ),
					value: attributes.suffix || '',
					onChange: function ( nextSuffix ) {
						setAttributes( {
							suffix: nextSuffix,
						} );
					},
					disabled: ! taxonomyObject,
				} )
			)
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

	registerBlockType( 'magic/block-meta-placeholder', {
		edit: function ( props ) {
			const attributes = props.attributes;
			const setAttributes = props.setAttributes;
			const blockProps = useBlockProps( {
				className: 'magic-block-meta-placeholder',
			} );

			const editorContext = useEditorContext();
			const resolved = getResolvedPostType( editorContext, attributes, props.context || {} );
			const isTemplateEditor = resolved.isTemplateEditor;
			const defaultPostType = resolved.defaultPostType;
			const resolvedPostType = resolved.resolvedPostType;
			const canConfigureBinding = resolved.canConfigureBinding;
			const fields = getFieldsForPostType( resolvedPostType, 'text' );
			const editedMeta = useSelect(
				function ( select ) {
					const editorStore = select( 'core/editor' );

					return editorStore && editorStore.getEditedPostAttribute
						? editorStore.getEditedPostAttribute( 'meta' ) || {}
						: {};
				},
				[]
			);
			const { editPost } = useDispatch( 'core/editor' );
			const selectedField =
				fields.find( function ( field ) {
					return field.value === attributes.metaKey;
				} ) || null;
			const metaValue =
				attributes.metaKey && 'string' === typeof editedMeta[ attributes.metaKey ]
					? editedMeta[ attributes.metaKey ]
					: attributes.value || '';
			const canEditInline = !! (
				attributes.metaKey &&
				resolvedPostType &&
				editorContext.postType === resolvedPostType
			);

			function updateMetaValue( nextValue ) {
				const cleanValue = nextValue || '';

				setAttributes( {
					value: cleanValue,
				} );

				if ( isTemplateEditor || ! attributes.metaKey || ! resolvedPostType || ! editorContext.postId ) {
					if (
						! isTemplateEditor &&
						attributes.metaKey &&
						resolvedPostType &&
						'function' === typeof editPost
					) {
						editPost( {
							meta: Object.assign( {}, editedMeta, {
								[ attributes.metaKey ]: cleanValue,
							} ),
						} );
					}

					if ( ! isTemplateEditor && editorContext.postId ) {
						markDirtyMetaValue( resolvedPostType, editorContext.postId, attributes.metaKey, cleanValue );
					}

					return;
				}

				if ( 'function' === typeof editPost ) {
					editPost( {
						meta: Object.assign( {}, editedMeta, {
							[ attributes.metaKey ]: cleanValue,
						} ),
					} );
				}

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
							__( 'Magic Meta Field: Placeholder', 'magic-block-meta' ),
							false,
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
						? renderEditorOnlyTemplateNotice(
							blockProps,
							resolvedPostType,
							false,
							__( 'Magic Meta Field: Placeholder', 'magic-block-meta' )
						  )
						: renderCompactState(
							blockProps,
							'single',
							__( 'Magic Meta Field: Placeholder', 'magic-block-meta' ),
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
								__( 'Choose a field in block settings. This block never renders on the front end.', 'magic-block-meta' ),
							]
						  ) )
					: ! canEditInline
						? renderCompactState(
							blockProps,
							'single',
							__( 'Magic Meta Field: Placeholder', 'magic-block-meta' ),
							[
								selectedField
									? sprintf(
											__( 'Linked to `%s`.', 'magic-block-meta' ),
											selectedField.label
									  )
									: sprintf(
											__( 'Linked to `%s`.', 'magic-block-meta' ),
											attributes.metaKey
									  ),
								__( 'This block becomes editable in the matching post editor and renders nothing on the front end.', 'magic-block-meta' ),
							]
						  )
						: renderPlaceholderFieldEditor(
							blockProps,
							selectedField,
							attributes.metaKey,
							metaValue,
							updateMetaValue
						  )
			);
		},
		save: function () {
			return null;
		},
	} );

	registerBlockType( 'magic/post-terms', {
		edit: function ( props ) {
			const attributes = props.attributes;
			const setAttributes = props.setAttributes;
			const blockProps = useBlockProps( {
				className: 'wp-block-post-terms',
			} );
			const editorContext = useEditorContext();
			const resolved = getResolvedPostType( editorContext, attributes, props.context || {} );
			const resolvedPostType = resolved.resolvedPostType;
			const isTemplateEditor = resolved.isTemplateEditor;
			const [ termQuery, setTermQuery ] = useState( '' );
			const { editPost } = useDispatch( 'core/editor' );
			const taxonomies = useSelect(
				function ( select ) {
					const coreStore = select( 'core' );
					const records =
						coreStore && coreStore.getTaxonomies && resolvedPostType
							? coreStore.getTaxonomies( {
									type: resolvedPostType,
							  } )
							: [];

					if ( ! Array.isArray( records ) ) {
						return [];
					}

					return records.filter( function ( taxonomy ) {
						return (
							taxonomy &&
							( taxonomy.slug || taxonomy.name ) &&
							( ! taxonomy.visibility || false !== taxonomy.visibility.publicly_queryable )
						);
					} );
				},
				[ resolvedPostType ]
			);
			const taxonomyObject = useSelect(
				function ( select ) {
					const coreStore = select( 'core' );

					return coreStore && coreStore.getTaxonomy && attributes.term
						? coreStore.getTaxonomy( attributes.term )
						: null;
				},
				[ attributes.term ]
			);
			const searchedTerms = useSelect(
				function ( select ) {
					const coreStore = select( 'core' );

					if ( ! coreStore || ! coreStore.getEntityRecords || ! attributes.term ) {
						return [];
					}

					const records = coreStore.getEntityRecords( 'taxonomy', attributes.term, {
						per_page: 20,
						hide_empty: false,
						context: 'view',
						search: termQuery || undefined,
						orderby: 'name',
						order: 'asc',
					} );

					return Array.isArray( records ) ? records : [];
				},
				[ attributes.term, termQuery ]
			);
			const editedTermIds = useSelect(
				function ( select ) {
					const editorStore = select( 'core/editor' );
					const coreStore = select( 'core' );

					if ( ! editorStore || ! editorStore.getEditedPostAttribute || ! attributes.term ) {
						return [];
					}

					const taxonomy =
						coreStore && coreStore.getTaxonomy ? coreStore.getTaxonomy( attributes.term ) : null;
					const restBase = taxonomy && taxonomy.rest_base ? taxonomy.rest_base : attributes.term;
					const ids = editorStore.getEditedPostAttribute( restBase );

					return Array.isArray( ids )
						? ids
								.map( function ( id ) {
									return Number( id );
								} )
								.filter( function ( id ) {
									return id > 0;
								} )
						: [];
				},
				[ attributes.term ]
			);
			const selectedTerms = useSelect(
				function ( select ) {
					const coreStore = select( 'core' );

					if (
						! coreStore ||
						! coreStore.getEntityRecords ||
						! attributes.term ||
						0 === editedTermIds.length
					) {
						return [];
					}

					const records = coreStore.getEntityRecords( 'taxonomy', attributes.term, {
						include: editedTermIds,
						per_page: editedTermIds.length,
						hide_empty: false,
						context: 'view',
					} );

					return Array.isArray( records ) ? records : [];
				},
				[ attributes.term, editedTermIds.join( ',' ) ]
			);
			const canEditInline = !! (
				attributes.term &&
				resolvedPostType &&
				editorContext.postType === resolvedPostType &&
				! isTemplateEditor
			);
			const canConfigureTermsBlock = ! canEditInline;

			if ( 'function' === typeof useBlockEditingMode ) {
				useBlockEditingMode( canEditInline ? 'contentOnly' : 'default' );
			}

			const termLabelById = {};
			const termsById = {};
			const orderedTerms = [];

			selectedTerms.concat( searchedTerms ).forEach( function ( term ) {
				if ( ! term || ! term.id ) {
					return;
				}

				if ( termsById[ term.id ] ) {
					return;
				}

				termsById[ term.id ] = term;
				termLabelById[ term.id ] = term.name;
				orderedTerms.push( term );
			} );

			const selectedNames = editedTermIds
				.map( function ( id ) {
					return termLabelById[ id ];
				} )
				.filter( Boolean );
			const previewText = [
				attributes.prefix || '',
				selectedNames.length > 0
					? selectedNames.join( attributes.separator || ', ' )
					: __( 'No terms assigned', 'magic-block-meta' ),
				attributes.suffix || '',
			]
				.filter( Boolean )
				.join( ' ' );
			const taxonomyLabel = taxonomyObject
				? taxonomyObject.labels && taxonomyObject.labels.singular_name
					? taxonomyObject.labels.singular_name
					: taxonomyObject.name || attributes.term
				: attributes.term || __( 'Terms', 'magic-block-meta' );
			const termItems = orderedTerms.map( function ( term ) {
				return {
					id: term.id,
					label: term.name,
					checked: editedTermIds.includes( Number( term.id ) ),
				};
			} );

			function updateAssignedTerms( nextIds ) {
				if ( ! taxonomyObject || 'function' !== typeof editPost ) {
					return;
				}

				editPost( {
					[ taxonomyObject.rest_base || attributes.term ]: nextIds,
				} );
			}

			function toggleAssignedTerm( termId, isChecked ) {
				const nextIds = isChecked
					? editedTermIds.concat( [ termId ] )
					: editedTermIds.filter( function ( id ) {
						return id !== termId;
					} );
				const uniqueIds = Array.from( new Set( nextIds ) );

				updateAssignedTerms( uniqueIds );
			}

			return createElement(
				Fragment,
				null,
				canConfigureTermsBlock
					? createElement(
						InspectorControls,
						null,
						renderTermsSettings( attributes, setAttributes, taxonomies, taxonomyObject )
					  )
					: null,
				! attributes.term
					? createElement(
						'div',
						blockProps,
						createElement( 'div', { className: 'magic-block-meta__placeholder' }, [
							createElement(
								'p',
								{
									key: 'title',
									className: 'magic-block-meta__placeholder-title',
								},
								__( 'Magic Post Terms', 'magic-block-meta' )
							),
							taxonomies.length > 0
								? createElement( SelectControl, {
									key: 'taxonomy',
									label: __( 'Taxonomy', 'magic-block-meta' ),
									value: attributes.term || '',
									options: buildTaxonomyOptions( taxonomies ),
									onChange: function ( nextTerm ) {
										setAttributes( {
											term: nextTerm,
										} );
									},
								  } )
								: null,
						] )
					  )
					: ! canEditInline
						? renderTermsPreview( blockProps, {
							previewText: previewText,
							items: selectedNames,
							separator: attributes.separator || ', ',
							taxonomyLabel: taxonomyLabel,
							isLink: false !== attributes.isLink,
							isEditable: false,
							emptyText: __( 'No terms assigned', 'magic-block-meta' ),
						  } )
						: renderTermsEditor( blockProps, {
							taxonomyLabel: taxonomyLabel,
							isLink: false !== attributes.isLink,
							separator: attributes.separator || ', ',
							value: selectedNames,
							query: termQuery,
							items: termItems,
							onQueryChange: setTermQuery,
							onToggle: toggleAssignedTerm,
						  } )
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
