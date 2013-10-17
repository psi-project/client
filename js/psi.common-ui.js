/*
 * PSI Basic UI Views
 * A small set of UI views and mix-ins to support various PSI clients.
 * 
 * Author: James Montgomery (james.montgomery at anu.edu.au)
 * 
 * Developed as part of the Protocols and Structures for Inference project: http://psi.cecs.anu.edu.au
 */

define(['jquery','underscore','backbone','psi.models','psi.client','psi.templates','jquery-ui','jquery.jstree','jquery.hotkeys'], function ($, _, Backbone, models, client, templates) {
	var module = {};

	//--jQuery UI Tabs helpers----------------------------------------------------
	//Replacing some of the functionality lost in changes to jQuery UI after v1.9
    // and adding a little extra based on the new example they present.

	/**
	 * Inserts the given view into an existing set of tabs at the specified
	 * index. If index is omitted then the tab is added at the end.
	 * If closeable is given and true then the new tab can be closed via a
	 * small 'x' icon (if bindTabClose() has been called on the set of tabs).
	 * This restores some of the functionality lost in changes to jQuery UI
	 * after v1.9.
	 */
	module.insertTab = function insertTab(tabs, view, title, index, closeable) {
		var lis = tabs.find('.ui-tabs-nav').first().children('li');
		if (index === undefined || index < 0)
			index = lis.length;
		var $li = $( templates.get('tab-template')({ panelID: view.id, title: title, closeable: closeable || false }) );

		var panels = tabs.children('.ui-tabs-panel');
		if (index >= lis.length) {
			$li.insertAfter( lis[lis.length-1] );
			view.$el.insertAfter( panels[panels.length-1] );
		} else {
			$li.insertBefore( lis[index] );
			view.$el.insertBefore( panels[index] );
		}
		tabs.tabs('refresh');
    };

	/**
	 * Adds an event handler to the close icon on tabs in the given set of tabs
	 * that will remove the tab and the DOM container element that the tab
	 * points to. The callback function is also called (in the given context)
	 * with the index of the tab and id of the removed panel.
	 */
	module.bindTabClose = function bindTabClose(tabs, callback, context) {
		tabs.delegate( "span.ui-icon-close", "click", function() {
	 		var li = $(this).closest('li');
			var idx = li.index();
	 		var panelID = li.children('a').attr('href');
	 		li.remove();
			$(panelID).remove();
			callback.call(context, idx, panelID);
			tabs.tabs('refresh');
		});
	};

	//--URI & Schema display utilities--------------------------------------------

	/** Mix this in with a view to provide an event handler for an *icon* within togglable schema text. */
	module.SchemaDisplayUtils = {
		toggleSchemaHandler: function(event) {
			var target = $(event.currentTarget).parent();
			if (target.hasClass('togglable'))
				target.addClass('hidden').siblings('.togglable').removeClass('hidden');
		}
	};
	
	//--Interaction form helpers-----------------------------------------------
	
	/**
	 * Returns a function that enables the given (jQuery-wrapped) button and
	 * tells the given client that work has finished.
	 */
	module.newButtonEnabler = function newButtonEnabler($button) {
		return function() { $button.prop('disabled', false); client.stopWorking(); };
	};
	
	//--Views----------------------------------------------------------------------
	
	var BaseResourceListDisplay = Backbone.View.extend({
		SELECTION_CHANGED: 'selectionchanged',
		controlsTemplate: templates.get('resource-list-controls-template'),
		/** 
		 * Pass the option monitorModel: true if you want the display to rerender
		 * itself (losing any changes you have made to it) when its current model
		 * changes.
		 */
		initialize: function() {
			_.extend(this, Backbone.Events);
			this.load_selected = _.has(this.options, 'load_selected') ? this.options.load_selected : true;
			if (!_.has( this.options, 'monitorModel') )
				this.options.monitorModel = true;
			this.setModel(this.model);
			this.$el.on('remove', function() {
				if (this.model)
					this.model.off('change', this.render, this);
			});
		},
		setModel: function(model) {
			if (this.options.monitorModel && this.model)
				this.model.off('change', this.render, this);
			if (this.model === null || this.model !== model) {
				this.selectedURI = this.selectedModel = null;
				this.trigger(this.SELECTION_CHANGED, this.selectedURI, this.selectedModel);
			}
			if (model) {
				this.model = model;
				if (this.options.monitorModel) {
					model.on('change', this.render, this);
					this.render();
				}
			}
		},
		unescapeAmps: function(htmlURI) { return htmlURI.replace(/&amp;/g,'&'); },
		/** Allow user to hide the list to more room in UI and also to manually refresh the list. */
		addListControls: function() {
			var $controls = $( this.controlsTemplate() );
			var $scrollBox = this.$el.children('.scrollbox');
			this.$el.css('position', 'relative');
			var view = this;
			var $refreshButton = $controls.children('[title="Refresh"]')
				.on('click', function() { if (!$(this).hasClass('disabled')) view.model.refresh(); });
			$controls.children('[title="Hide"]').on('click', function() {
				var $btn = $(this);
				var show = $(this).attr('title') !== 'Hide';
				var actions = function() {
					$btn.attr('title', show ? 'Hide' : 'Show' )
						.children('i').toggleClass('icon-chevron-up').toggleClass('icon-chevron-right');
					$controls.toggleClass('btn-group-vertical')
						.css('position', show ? 'absolute' : 'inherit');
					$refreshButton.toggleClass('disabled');
				};
				//Just for the look of the thing
				if (show) {
					actions();
					$scrollBox.fadeIn();
				} else {
					$scrollBox.fadeOut( actions );
				}
			});
			this.$el.append( $controls );
		}
	});
	
	/**
	 * Simple 'View' for displaying selectable list of URIs associated with a PSICollection.
	 */
	module.ResourceListDisplay = BaseResourceListDisplay.extend({
		template: templates.get('resource-list-template'),
		render: function() {
			this.$el.html( this.template( _.extend({ resources : this.model.get('resources'), labels : this.model.get('resourceLabels') }, templates.ViewHelpers) ) );
			var context = this;
			this.$el.delegate('.urilist > li', 'click', function(evt) {
				var $selected = $(evt.currentTarget);
				$selected.addClass('ui-selected').siblings().removeClass('ui-selected');
				context.selectedURI = context.unescapeAmps( $selected.children('span').attr('title') );
				if (context.load_selected)
					context.selectedModel = context.model.getResource( context.selectedURI );
				context.trigger(context.SELECTION_CHANGED, context.selectedURI, context.selectedModel);
			} );
			if (! this.options.hideListControls)
				this.addListControls();
			//re-rendering removes any visual selection, so clear recorded selection
			this.trigger(this.SELECTION_CHANGED, null, null);
			return this;
		}
	});
	
	//Not all of these will be used, and certainly some of these are not psiTypes, but pre-emptively assigning icons to things that may need one
	var iconNameMap = {
		service: 'home',
		'resource-list': null,
		relation: 'calculator',
		attribute: 'tag',
		learner: 'search',
		predictor: 'lightbulb',
		transformer: 'gear',
		'schema-collection': 'script',
		joins: 'link'
	};
	
	/** Returns the name (i.e., end part) of the icon for the given resource 'type'. */
	module.iconName = function iconName(resourceType) { return iconNameMap[resourceType]; };
	
	/**
	 * Returns the value of a CSS property for a particular element with the
	 * given classes applied, as defined by the currently loaded style sheets.
	 * If withinClasses is given then the element is nested in a div with
	 * those classes applied.
	 */
	module.getCSSProp = function getCSSProp(el, classes, prop, withinClasses) {
		var $el = $('<' + el + ' class="' + classes + '">');
		var $attached = withinClasses ? $('<div class="' + withinClasses + '">').append($el) : $el;
		$attached.hide().appendTo('body');
		var css = $el.css(prop);
		$attached.remove();
		return css;
	};
	
	module.ResourceTreeDisplay = BaseResourceListDisplay.extend({
		COLLECTION: 'rtd.containing_collection',
		URI: 'rtd.resource_uri',
		LISTENING: 'rtd.listening_to_a_collection',
		RESOURCE_DBL_CLICKED: 'rtd.dblclicked',
		extractURI: function($el) { return this.unescapeAmps( $el.data(this.URI) ); },
		_isResType: function(resource, type) { return resource instanceof type || resource === type; },
		/** Mostly returns a model's psiType, except for those collections we wish to hide. */
		_getNodeType: function(resource, collection) {
			if (resource) {
				if (this._isResType(resource, models.LearnersModel) || this._isResType(resource, models.SchemasModel))
					return 'hidden';
				else if (this._isResType(resource, models.ModelJoins))
					return 'joins';
				else if (this._isResType(resource, models.PredictorModel))
					return 'predictor'; //predictors may be transformers, but get different icons, etc.
				return resource.psiType || resource.prototype.psiType;
			} else if (collection) {
				if (collection instanceof models.ServiceModel) return 'resource-list';
				else if (this._isResType(collection, models.Collection))
					return this._getNodeType(collection.resourceModel);
			}
			return 'hidden';
		},
		treeIcons: function() {
			if (! module.ResourceTreeDisplay.prototype._treeIcons)
				module.ResourceTreeDisplay.prototype._treeIcons = module.getCSSProp('span', 'ui-icon', 'background-image', 'ui-state-highlight').replace(/(^url\(|\)$)/g,'');
			return module.ResourceTreeDisplay.prototype._treeIcons;
		},
		iconOffset: function(iconName) {
			if (! module.ResourceTreeDisplay.prototype._iconOffsets)
				module.ResourceTreeDisplay.prototype._iconOffsets = {};
			var icon = 'ui-icon-' + iconName;
			if (! module.ResourceTreeDisplay.prototype._iconOffsets[icon])
					module.ResourceTreeDisplay.prototype._iconOffsets[icon] = module.getCSSProp('span', icon, 'background-position');
			return module.ResourceTreeDisplay.prototype._iconOffsets[icon];
		},
		_makeType: function(kind, children) {
			var view = this;
			var def = { valid_children: children, select_node: function(li) { return view._selectNode(li); } };
			if (module.iconName(kind))
				def.icon = { image: this.treeIcons(), position: this.iconOffset( module.iconName(kind) ) };
			return def;
		},
		_allTypes: ['service','resource-list','relation','attribute','learner','transformer','predictor','joins'],
		_alwaysVisibleTypes: ['service','resource-list'],
		_visibleTypes: ['service','resource-list','relation','attribute','transformer','predictor','joins'], //initial defaults
		_selectableTypes: [ 'attribute', 'transformer', 'predictor' ],
		initialize: function() {
			var view = this;
			this.$el.append( this.$tree = $('<div>') );
			view.jstree_config = {
				plugins: ['html_data', 'ui', 'themes', 'crrm', 'hotkeys', 'types'],
				core: { html_titles: true },
				ui: { select_limit: 1, selected_parent_close: false },
				types: {
					valid_children: 'all',
					types: {
						service: view._makeType('service', [ 'resource-list', 'relation', 'attribute', 'learner', 'transformer', 'predictor' ]),
						'resource-list': view._makeType('resource-list', [ 'relation', 'learner', 'transformer', 'predictor' ]),
						relation: view._makeType('relation', 'attribute'),
						attribute: view._makeType('attribute', ['attribute','joins']),
						learner: view._makeType('learner', 'none'),
						predictor: view._makeType('predictor', 'joins'),
						transformer: view._makeType('transformer', 'joins'),
						joins: view._makeType('joins', ['attribute','transformer','predictor'])
					}
				}
			};
			this.$tree.on('loaded.jstree', function() { view.expandChildren(view.model, view.$tree); })
				.addClass('scrollbox')
				.css('max-height', '30em')
				.on('dblclick.jstree', function(event) {
					var li = $(event.target).closest('li');
					if (_.contains(view._selectableTypes, li.attr('rel')))
						view.trigger(view.RESOURCE_DBL_CLICKED, view.extractURI(li));
				});
	
			BaseResourceListDisplay.prototype.initialize.call(this);
		},
		render: function() {
			if (this.model) {
				if (this.model.has('resources')) {
					this.model.off('change', this.render, this); //only completely re-render once after model has been fetched from server
					if (this.$tree.hasClass('jstree')) {
						//FIXME This is probably not helping to reduce the number of stray event listeners
						var LISTENING = this.LISTENING;
						this.$tree.find('li').add(this.$tree).each( function(i, node) {
							var $node = $(node);
							if ($node.data(LISTENING))
								$node.data(LISTENING)();
						});
						this.$tree.empty();
						this.expandChildren(this.model, this.$el);
					} else { //load tree from scratch (once ready will expand children)
						this.$tree.jstree(this.jstree_config);
						if (! this.options.hideListControls)
							this.addListControls();
					}
				} else { //wait until model is ready to be rendered
					this.model.on('change', this.render, this);
				}
			}
			this.trigger(this.SELECTION_CHANGED, null, null);
			return this;
		},
		closeAll: function() {
			this.$tree.jstree('close_all');
			return this;
		},
		clearSelection: function() {
			this.$tree.jstree('deselect_all');
			this.selectedURI = this.selectedModel = null;
			this.trigger(this.SELECTION_CHANGED, null, null);
		},
		hideTypes: function(types) {
			this.showAllTypes();
			_.each(types, function(type) { this.$tree.find('li[rel=' + type + ']').hide(); }, this);
			this._visibleTypes = _.difference(this._visibleTypes, types);
		},
		showAllTypes: function() { this.$tree.find('li').show(); },
		setSelectableTypes: function(types) {
			this._selectableTypes = _.compact(types); //take a copy
			this._visibleTypes = _.union(this._alwaysVisibleTypes, types);
			if (_.contains(types, 'attribute') && !_.contains(types, 'relation'))
				this._visibleTypes.push('relation');
			if (this.selectedModel && ! _.contains(types, this._getNodeType(this.selectedModel)))
				this.clearSelection();
			
			//TODO Hide currently visible nodes that should be hidden; may need to be delayed
			this.hideTypes(_.difference(this._allTypes, this._visibleTypes));
		},
		_selectNode: function(li) {
			var selectedURI = this.extractURI(li);
			var selectedModel = null;
			var view = this;
			if (this.load_selected && li.attr('rel') != 'joins') {
				var collection = li.data(this.COLLECTION) || this.model;
				var view = this;
				selectedModel = collection.getResource( selectedURI, function(loadedModel) {
					view._updateNodeTooltip(li, loadedModel);
					view.expandChildren(loadedModel, li);
				});
			}
			var type = li.attr('rel');
			var isSelectable = _.contains(this._selectableTypes, type);
			if (isSelectable) {
				this.selectedURI = selectedURI;
				this.selectedModel = selectedModel;
				this.trigger(this.SELECTION_CHANGED, selectedURI, selectedModel);
			}
			return isSelectable;
		},
		expandChildren: function(collection, li) {
			var view = this;
			//Last condition is special case for creating the initial, top-level nodes given that top-most collection is not represented in tree
			if (collection.has('resources') && (li.find('ul').length == 0 || li.find('ul').find('li').length == 0)) {
				_.each(collection.get('resources'), this._childGenerator(view, collection, li));
			}
			//Not all collections even support being asked if they have joins
			if (collection.hasJoins && collection.hasJoins() && li.children('ul').children('li[rel="joins"]').length === 0)
				this._childGenerator(view, collection, li, 'Joins').call(null, collection.getJoins(), 'Joined resources for ' + collection.id);
			this._monitorResource(view, collection, li);
		},
		_childGenerator: function(view, collection, li, displayedTitle) {
			return function(res, uri) {
				var type = view._getNodeType(res, collection);
				view.$tree.jstree('create', li, 'last',
					{ attr : { rel : type, title: uri }, data: displayedTitle || templates.ViewHelpers.queryAsNote( collection.get('resourceLabels')[uri] ) },
					function(child) {
						child.data(view.COLLECTION, collection);
						child.data(view.URI, uri);
						view._updateNodeTooltip(child, res, uri);
//FIXME May need to be delayed
						if (! _.contains(view._visibleTypes, type))
							child.hide();
						if (res && res.has('resources'))
							view.expandChildren(res, child);
					}, true);
			};
		},
		_updateNodeTooltip: function($li, res, uri) {
			$li.tooltip({ content:
				$li.attr('rel') === 'joins' ?
					'<em>' + uri + '</em>' :
					(res && res.has('description') ? '<strong>Description:</strong> ' + res.get('description') + '<br>' : '') +
						'<strong>URI:</strong> ' + (uri ? uri : res.id)
			});
		},
		_monitorResource: function(view, collection, li) {
			//Listen to collection only if listener not already bound (listener
			//removes copies of itself from child li elements when they are deleted).
			//FIXME Under some circumstances, some nodes do not remove themselves (but this fault is hard to track down and fix)
			if ((collection.has('resources') || collection.hasJoins) && ! li.data(view.LISTENING)) { //hasJoins instead of hasJoins() because it is enough that it *could* have joins in the future
				var changeListener = function() {
					var children = li.find('li');
					this.$tree.jstree('delete_node', children);
					children.each( function(i, child) {
						var $child = $(child);
						if ($child.data(view.LISTENING))
							$child.data(view.LISTENING)();
					});
					this.expandChildren(collection, li);
				};
                var cleanUp = function() { collection.off('change', changeListener, view); };
                li.data(view.LISTENING, cleanUp);
				collection.on('change', changeListener, this);
			}
		}
	});

	/** An older, simpler and no longer used drop-down list of PSI resources. */
	module.ResourceDropdownList = BaseResourceListDisplay.extend({
		template: templates.get( 'resource-drop-down-template' ),
		events: { 'change .urilist' : 'selectionChanged' },
		render: function() {
			this.$el.html( this.template( _.extend({ resources : this.model.get('resources'), hide: this.model.id, label: this.options.label }, templates.ViewHelpers) ) );
			var list = this.$el.find('select.urilist');
			if (this.selectedURI == null && list.prop('selectedIndex') >= 0) //select first option
				list.trigger('change');
			return this;
		},
		selectionChanged: function(e) {
			var list = this;
			this.selectedURI = this.unescapeAmps( e.target.options[ e.target.selectedIndex ].value );
			if (this.load_selected)
				this.selectedModel = this.model.getResource( this.selectedURI,
					function(model) {
						list.trigger(list.SELECTION_CHANGED, list.selectedURI, model);
					} );
		}
	});
	
	/**
	 * Allows the user to select a known PSI resource by presenting a tree of
	 * all known resources and their contained collections and low-level
	 * resorces. User selection is indiated by an event with the name
	 * SelectResourceDialog.RESOURCE_SELECTED.
	 */
	module.SelectResourceDialog = Backbone.View.extend({
		RESOURCE_SELECTED: 'resourceselected',
		USER_CLOSING: 'userclosing',
		initialize: function() {
			_.extend(this, Backbone.Events);
			this.el.title = 'Select a resource'; //should be replace before ever seen by user
			this.help = $('<p class="help-inline"></p>');
			this.treeRendered = false;
			this.treeView = new module.ResourceTreeDisplay({ model: this.model, hideListControls: true });
			this.treeView.on(this.treeView.SELECTION_CHANGED, function(selected) { this.selectedModel = selected; }, this);
			this.treeView.on(this.treeView.RESOURCE_DBL_CLICKED, this.triggerSelection, this);
	//FIXME Decide if can be bothered making the button disabled when resource tree first shown (and no resource actually selected)
	//		this.treeView.on(this.attrTree.SELECTION_CHANGED,
	//			function(selected) { selected ? this.$el.find('button').prop('disabled', false) : this.$el.find('button').prop('disabled', true); }, this);
			this.render();
		},
//FIXME Work out least disruptive way of clearing the tree and reloading it afresh when a service has been added
		triggerSelection: function() { this.trigger(this.RESOURCE_SELECTED, this.treeView.selectedURI, this.listener); },
		render: function() {
	//FIXME Need a refresh button to force reloading of the tree when, say, a new attribute has been created
	
			var view = this;
	//		var dialog = this.$el.html( this.treeView.render().el );
			var dialog = this.$el.empty();
			dialog.dialog({ autoOpen: false, width: 'auto', dialogClass: 'shadowDialog',
				buttons: {
					Select: function() { view.triggerSelection(); },
					Close: function() { view.close(); }
				},
				open: function() {
					if (!view.treeRendered) {
						view.$el.html( view.help ).append( view.treeView.render().el );
						setTimeout(function() { view.treeView.closeAll(); }, 50);
						view.treeRendered = true;
					}
				},
				beforeClose: function() {
					view.trigger(view.USER_CLOSING);
				}
			});
			return this;
		},
		show: function(resName, help, nodeTypes, listener, field) {
			this.listener = listener;
			this.$el.siblings('div.ui-dialog-titlebar').children('span.ui-dialog-title')
				.html( 'Select the <em>' + resName + '</em> resource (or just type its URI)' );
			this.help.html( help || '' ); 
			this.treeView.setSelectableTypes(nodeTypes);
			if (field)
				this.$el.dialog('option', 'position', { my: 'left top', at: 'right top', of: field});
			this.$el.dialog('open');
		},
		close: function() { this.$el.dialog('close'); },
		isOpen: function () { return this.$el.dialog('isOpen'); }
	});

	/**
	 * Can be mixed-in to any view that uses a form to collect PSI resource
	 * URIs with the assistance of the SelectResourceDialog.
	 */
	module.ResourceFormMixIn = {
		/** Start monitoring the SelectResourceDialog for selection and close events. */	
		setPopup: function(popup) {
			this.selectResourcePopup = popup;
			popup.on(popup.RESOURCE_SELECTED, this.insertResource, this);
			popup.on(popup.USER_CLOSING, this.popupClosed, this);
		},
		/** Bind dialog display to the form field receiving focus. */
		bindSelectionPopup: function($inputField, resName, expectedType) {
			var view = this,
				help = $inputField.siblings('span.help-inline').html(),
				types = _.isArray(expectedType) ? expectedType : [expectedType];
			$inputField.on('focus', function(evt) {
				if (view.focusedResource !== $inputField) {
					//Workaround for new(?) jQuery UI behaviour of returning the focus to the DOM element
					// that had it when the dialog was opened (which we *really* do not require here).
					if (view.ignoreNextFocusEvent) {
						if (view.focusedResource) view.focusedResource.focus(); //restore focus stolen by dialog being 'helpful'
						view.ignoreNextFocusEvent = false;
						return;
					}
					var alreadyOpen = view.selectResourcePopup.isOpen();
					view.focusedResource = $inputField;
					view.selectResourcePopup.show(resName, help, types, view, $inputField);
					if (! alreadyOpen)
						view.focusedResource.focus();
				}
				view.ignoreNextFocusEvent = false;
			})
			.on('blur', function() { if (!view.selectResourcePopup.isOpen()) view.focusedResource = null; });
		},
		insertResource: function(uri, listener) {
			if (!listener || listener == this)
				this.focusedResource.val( uri );
		},
		popupClosed: function() {
			this.focusedResource = null;
			this.ignoreNextFocusEvent = true;
		}
	};

	module.ReusableView = Backbone.View.extend({
		initialize: function () {
			_.extend(this, module.SchemaDisplayUtils);
			this.setModel(this.model);
			if (this.model) this.id = this.model.uriToID();
			this.$el.on('remove', function() {
//FIXME Will this fire at the right time?
if (this.model) this.model.off('change', this.render, this);
console.log('Change listeners on ' + this.model.cid + ': ' + this.model._events.change.length);
}, this);

		},
		setModel: function (model) {
			if (this.model != null)
				this.model.off('change', this.render, this);
			this.model = model;
			if (this.model != null)
				this.model.on('change', this.render, this);
			this.render();
		}
	});

	return module;
});
