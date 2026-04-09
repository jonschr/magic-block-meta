( function ( wp, settings ) {
	const { PanelBody, SelectControl, TextControl, TextareaControl } = wp.components;
	const { useDispatch, useSelect, subscribe, select } = wp.data;
	const { Fragment, createElement: el } = wp.element;
	const { __ } = wp.i18n;
	const PluginDocumentSettingPanel =
		wp.editPost && wp.editPost.PluginDocumentSettingPanel
			? wp.editPost.PluginDocumentSettingPanel
			: null;
	const registerPlugin =
		wp.plugins && wp.plugins.registerPlugin ? wp.plugins.registerPlugin : null;
	const InspectorControls =
		wp.blockEditor && wp.blockEditor.InspectorControls
			? wp.blockEditor.InspectorControls
			: null;
	const addFilter = wp.hooks && wp.hooks.addFilter ? wp.hooks.addFilter : null;
	const createHigherOrderComponent =
		wp.compose && wp.compose.createHigherOrderComponent
			? wp.compose.createHigherOrderComponent
			: null;
	const apiFetch = wp.apiFetch;

	const fieldMap = settings && settings.fields ? settings.fields : {};
	const runtime = window.magicBlockMetaRuntime || ( window.magicBlockMetaRuntime = { dirtyByEntity: {} } );
	const BUTTON_TARGET_OPTIONS = [
		{
			label: __( 'Same tab', 'magic-block-meta' ),
			value: '',
		},
		{
			label: __( 'New tab or window', 'magic-block-meta' ),
			value: '_blank',
		},
		{
			label: __( 'Same frame', 'magic-block-meta' ),
			value: '_self',
		},
		{
			label: __( 'Parent frame', 'magic-block-meta' ),
			value: '_parent',
		},
		{
			label: __( 'Top frame', 'magic-block-meta' ),
			value: '_top',
		},
	];

	function getFieldsForPostType( postType ) {
		if ( ! postType || ! fieldMap[ postType ] ) {
			return [];
		}

		return fieldMap[ postType ].filter( function ( field ) {
			return 'text' === field.type;
		} );
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

	function getDirtyMetaValues( postType, postId ) {
		const entityKey = getEntityKey( postType, postId );

		if ( ! entityKey || ! runtime.dirtyByEntity[ entityKey ] ) {
			return {};
		}

		return { ...runtime.dirtyByEntity[ entityKey ] };
	}

	function clearDirtyMetaValues( postType, postId, metaKeys ) {
		const entityKey = getEntityKey( postType, postId );

		if ( ! entityKey || ! runtime.dirtyByEntity[ entityKey ] ) {
			return;
		}

		metaKeys.forEach( ( metaKey ) => {
			delete runtime.dirtyByEntity[ entityKey ][ metaKey ];
		} );

		if ( 0 === Object.keys( runtime.dirtyByEntity[ entityKey ] ).length ) {
			delete runtime.dirtyByEntity[ entityKey ];
		}
	}

	function getMetaValue( meta, metaKey ) {
		if ( ! metaKey || ! meta || 'string' !== typeof meta[ metaKey ] ) {
			return '';
		}

		return meta[ metaKey ];
	}

	function getPostRestPath( postType, postId ) {
		if ( ! postType || ! postId ) {
			return '';
		}

		const coreStore = select( 'core' );
		const postTypeObject = coreStore && coreStore.getPostType ? coreStore.getPostType( postType ) : null;
		const restBase = postTypeObject && postTypeObject.rest_base ? postTypeObject.rest_base : postType;

		return '/wp/v2/' + restBase + '/' + postId;
	}

	function MetaFieldsPanel() {
		const editorContext = useSelect( ( selectFn ) => {
			const editorStore = selectFn( 'core/editor' );
			const postType =
				editorStore && editorStore.getCurrentPostType
					? editorStore.getCurrentPostType()
					: null;
			const postId =
				editorStore && editorStore.getCurrentPostId
					? editorStore.getCurrentPostId()
					: null;
			const meta =
				editorStore && editorStore.getEditedPostAttribute
					? editorStore.getEditedPostAttribute( 'meta' ) || {}
					: {};

			return {
				postType,
				postId,
				meta,
			};
		}, [] );
		const { editPost } = useDispatch( 'core/editor' );
		const fields = getFieldsForPostType( editorContext.postType );

		if ( ! editorContext.postType || 0 === fields.length ) {
			return null;
		}

		function updateMetaValue( metaKey, nextValue ) {
			if ( 'function' !== typeof editPost ) {
				return;
			}

			editPost( {
				meta: {
					...editorContext.meta,
					[ metaKey ]: nextValue,
				},
			} );

			markDirtyMetaValue( editorContext.postType, editorContext.postId, metaKey, nextValue );
		}

		return el(
			PluginDocumentSettingPanel,
			{
				name: 'magic-block-meta-fields',
				title: __( 'Meta Fields', 'magic-block-meta' ),
			},
			fields.map( ( field ) => {
				const Control = field.multiline ? TextareaControl : TextControl;

				return el( Control, {
					key: field.value,
					label: field.label,
					value: getMetaValue( editorContext.meta, field.value ),
					onChange: function ( nextValue ) {
						updateMetaValue( field.value, nextValue );
					},
					help: field.value,
					rows: field.multiline ? 6 : undefined,
				} );
			} )
		);
	}

	if ( registerPlugin && PluginDocumentSettingPanel ) {
		registerPlugin( 'magic-block-meta-panel', {
			render: MetaFieldsPanel,
		} );
	}

	if ( addFilter && createHigherOrderComponent && InspectorControls ) {
		addFilter(
			'editor.BlockEdit',
			'magic-block-meta/button-target-control',
			createHigherOrderComponent( function ( BlockEdit ) {
				return function ( props ) {
					const attributes = props.attributes || {};
					const tagName = attributes.tagName || 'a';
					const rawLinkTarget =
						'string' === typeof attributes.linkTarget ? attributes.linkTarget : '';
					const hasCustomTarget =
						'' !== rawLinkTarget &&
						! BUTTON_TARGET_OPTIONS.some( function ( option ) {
							return option.value === rawLinkTarget;
						} );
					const selectedTarget = hasCustomTarget ? '' : rawLinkTarget;

					if ( 'core/button' !== props.name || 'a' !== tagName ) {
						return el( BlockEdit, props );
					}

					return el(
						Fragment,
						null,
						el( BlockEdit, props ),
						el(
							InspectorControls,
							null,
							el(
								PanelBody,
								{
									title: __( 'Link Target', 'magic-block-meta' ),
									initialOpen: false,
								},
								el( SelectControl, {
									label: __( 'Common target', 'magic-block-meta' ),
									value: selectedTarget,
									options: BUTTON_TARGET_OPTIONS,
									onChange: function ( nextValue ) {
										props.setAttributes( {
											linkTarget: nextValue,
										} );
									},
									help: __(
										'Choose a standard target for the button link.',
										'magic-block-meta'
									),
								} ),
								el( TextControl, {
									label: __( 'Custom target value', 'magic-block-meta' ),
									value: hasCustomTarget ? rawLinkTarget : '',
									onChange: function ( nextValue ) {
										props.setAttributes( {
											linkTarget: nextValue,
										} );
									},
									help: __(
										'Optional. Leave blank to use the standard target above, or enter a custom browsing context name.',
										'magic-block-meta'
									),
								} )
							)
						)
					);
				};
			}, 'withMagicBlockMetaButtonTargetControl' )
		);
	}

	let wasSavingPost = false;
	let wasSavingMetaBoxes = false;
	let lateSyncInFlight = false;

	subscribe( function () {
		const editorStore = select( 'core/editor' );
		const editPostStore = select( 'core/edit-post' );

		if ( ! editorStore ) {
			return;
		}

		const isSavingPost = editorStore.isSavingPost ? editorStore.isSavingPost() : false;
		const isAutosavingPost = editorStore.isAutosavingPost ? editorStore.isAutosavingPost() : false;
		const didSaveSucceed = editorStore.didPostSaveRequestSucceed ? editorStore.didPostSaveRequestSucceed() : false;
		const isSavingMetaBoxes = editPostStore && editPostStore.isSavingMetaBoxes ? editPostStore.isSavingMetaBoxes() : false;
		const postType = editorStore.getCurrentPostType ? editorStore.getCurrentPostType() : null;
		const postId = editorStore.getCurrentPostId ? editorStore.getCurrentPostId() : null;
		const dirtyMeta = getDirtyMetaValues( postType, postId );
		const dirtyKeys = Object.keys( dirtyMeta );
		const finishedSaving = ( wasSavingPost || wasSavingMetaBoxes ) && ! isSavingPost && ! isSavingMetaBoxes;

		wasSavingPost = isSavingPost;
		wasSavingMetaBoxes = isSavingMetaBoxes;

		if ( lateSyncInFlight || ! finishedSaving || isAutosavingPost || ! didSaveSucceed ) {
			return;
		}

		if ( ! postType || ! postId || 0 === dirtyKeys.length ) {
			return;
		}

		const path = getPostRestPath( postType, postId );

		if ( ! path || 'function' !== typeof apiFetch ) {
			return;
		}

		lateSyncInFlight = true;

		apiFetch( {
			path,
			method: 'POST',
			data: {
				meta: dirtyMeta,
			},
		} )
			.then( function () {
				clearDirtyMetaValues( postType, postId, dirtyKeys );
			} )
			.finally( function () {
				lateSyncInFlight = false;
			} );
	} );
} )( window.wp, window.magicBlockMetaSettings || {} );
