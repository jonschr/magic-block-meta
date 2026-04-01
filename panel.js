( function ( wp, settings ) {
	const { TextControl, TextareaControl } = wp.components;
	const { useDispatch, useSelect, subscribe, select } = wp.data;
	const { createElement: el } = wp.element;
	const { __ } = wp.i18n;
	const { PluginDocumentSettingPanel } = wp.editPost;
	const { registerPlugin } = wp.plugins;
	const apiFetch = wp.apiFetch;

	const fieldMap = settings && settings.fields ? settings.fields : {};
	const runtime = window.magicBlockMetaRuntime || ( window.magicBlockMetaRuntime = { dirtyByEntity: {} } );

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

	registerPlugin( 'magic-block-meta-panel', {
		render: MetaFieldsPanel,
	} );

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
