( function ( wp, settings ) {
	const { TextControl, TextareaControl } = wp.components;
	const { useDispatch, useSelect } = wp.data;
	const { createElement: el } = wp.element;
	const { __ } = wp.i18n;
	const { PluginDocumentSettingPanel } = wp.editPost;
	const { registerPlugin } = wp.plugins;

	const fieldMap = settings && settings.fields ? settings.fields : {};
	const overrideMetaKey = settings && settings.overrideMetaKey ? settings.overrideMetaKey : 'elodin_block_meta_overrides';

	function getFieldsForPostType( postType ) {
		if ( ! postType || ! fieldMap[ postType ] ) {
			return [];
		}

		return fieldMap[ postType ];
	}

	function getMetaValue( meta, metaKey ) {
		if ( ! metaKey || ! meta ) {
			return '';
		}

		if (
			meta[ overrideMetaKey ] &&
			'object' === typeof meta[ overrideMetaKey ] &&
			'string' === typeof meta[ overrideMetaKey ][ metaKey ]
		) {
			return meta[ overrideMetaKey ][ metaKey ];
		}

		if ( 'string' !== typeof meta[ metaKey ] ) {
			return '';
		}

		return meta[ metaKey ];
	}

	function MetaFieldsPanel() {
		const editorContext = useSelect( ( select ) => {
			const editorStore = select( 'core/editor' );
			const postType =
				editorStore && editorStore.getCurrentPostType
					? editorStore.getCurrentPostType()
					: null;
			const meta =
				editorStore && editorStore.getEditedPostAttribute
					? editorStore.getEditedPostAttribute( 'meta' ) || {}
					: {};

			return {
				postType,
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
					[ overrideMetaKey ]: {
						...( editorContext.meta[ overrideMetaKey ] && 'object' === typeof editorContext.meta[ overrideMetaKey ] ? editorContext.meta[ overrideMetaKey ] : {} ),
						[ metaKey ]: nextValue,
					},
				},
			} );
		}

		return el(
			PluginDocumentSettingPanel,
			{
				name: 'elodin-block-meta-fields',
				title: __( 'Meta Fields', 'elodin-block-meta' ),
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

	registerPlugin( 'elodin-block-meta-panel', {
		render: MetaFieldsPanel,
	} );
} )( window.wp, window.elodinBlockMetaSettings || {} );
