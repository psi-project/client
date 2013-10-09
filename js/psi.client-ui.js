/*
 * PSI Client UI Views and App
 * 
 * Author: James Montgomery (james.montgomery at anu.edu.au)
 * 
 * Developed as part of the Protocols and Structures for Inference project: http://psi.cecs.anu.edu.au
 */

define(['jquery','underscore','backbone','psi.client','psi.common-ui','psi.evaluation-ui','psi.forms','psi.models','psi.schema','psi.table','psi.templates','psi.web+psi','jquery-ui','jsonform','date'],
function($, _, Backbone, client, psi_ui, evaluation_ui, forms, models, schema, table, templates, web_psi) {

	var module = {};

	jQuery.support.cors = true;

	//FIXME Work around to get forms to work correctly (at least not to submit to the server when used in a dialog?)
	$('form').submit( function(e) { e.preventDefault() } );
	
	var PSICollectionView = module.CollectionView = Backbone.View.extend({
		displayView: psi_ui.ResourceListDisplay,
		initialize: function() {
			this.id = this.options.rootID + '_' + this.title;
			this.$el.attr('id', this.id);
			this.model.on('change', this.render, this);
			this.$el.on('remove', function() {
//FIXME Does this event *ever* occur?
console.log('INFORMATION: PSICollectionView has been removed from the DOM and is no longer monitoring model for changes.');
				this.model.off('change', this.render, this);
			}, this);
			this.display = new this.displayView({ model: this.model });
			this.display.on(this.display.SELECTION_CHANGED, this.selectionChanged, this);
			this.itemView = this.resourceView == null ? null : new this.resourceView({ collectionView: this });
		},
		stopFollowingModel: function() { this.model.off('change', this.render, this); },
		render: function() {
			this.$el.append( this.display.render().el );
			//Append item's view, if it exists
			if (this.itemView)
				this.$el.append( this.itemView.render().el );
			return this;
		},
		selectionChanged: function(selectedURI, selectedModel) {
			if (this.itemView) this.itemView.setModel( selectedModel );
		}
	});
	
	
	//--Schema-----------------------------
	
	var SchemaView = module.SchemaView = psi_ui.ReusableView.extend({
		template: templates.get( 'schema-panel-template' ),
		render: function() {
			if (this.model == null) {
				this.$el.html( client.infoMessageHTML('Select a schema to view') );
			} else {
				this.$el.html ( this.template( { schema: this.model.asPrettyString() } ) );
			}
			return this;
		}
	});
	
	var SchemasView = module.SchemasView = PSICollectionView.extend({
		title: 'Schema',
		resourceView: SchemaView,
		iconName: psi_ui.iconName('schema-collection')
	});
	
	//----Relations and Attributes---------
	
	var AttributeView = module.AttributeView = psi_ui.ReusableView.extend({
		iconName: psi_ui.iconName('attribute'),
		template: templates.get( 'emitter-panel-template' ),
		interactionTemplate: templates.get( 'emitter-interaction-panel-template' ),

		joinRequest: forms.makeRequestFormData('composition', 'Join',
				"Join this attribute to a transformer or predictor.",
				{
					'join': { type: 'string', format: 'uri', title: 'Transformer URI', required: true },
					'description': { type: 'string', title: 'Description' }
				}),

		initialize: function() {
			_.extend(this, psi_ui.ResourceFormMixIn);
			psi_ui.ReusableView.prototype.initialize.call(this);
			this.setPopup( module.clientInstance().getSelectResourceDialog() );
		},
		
		events: {
			'click .schemaToggle' : 'toggleSchemaHandler',
			'click .apply-all' : 'toggleInstanceField',
			'blur .instance' : 'cleanInstance',
			'click button.apply' : 'apply',
			'click button.btn-danger' : 'deleteResource'
		},
	
		toggleInstanceField: function(e) {
			$(e.target).parent().find('.instance').spinner( $(e.target).is(':checked') ? 'disable' : 'enable');
		},
		
		cleanInstance: function(e) {
			var value = $(e.target).spinner('value'); 
			if (! value) {
				value = $(e.target).prop('value').replace(/[^\d]/g, '');
				value === '' ? 1 : value;
			}
			value = value < 1 ? 1 : (value > $(e.target).spinner('option', 'max') ? $(e.target).spinner('option', 'max') : value); 
			$(e.target).spinner('value', value);
		},

		/** Replicates some of createPostedForm() as attribute apply form has been hand-crafted. */
		apply: function(e) {
			e.preventDefault();
			var $div = $(e.target).closest('div');
			var instance = $div.find('.apply-all').is(':checked') ? 'all' : $div.find('.instance').spinner('value');
			var enableButton = psi_ui.newButtonEnabler( $div.find('button').prop('disabled', true) );
			client.startWorking('Retrieving attribute value' + (instance === 'all' ? 's' : ''));
			this.getEmitterValue($div, this.model, new models.ValueModel({ id:this.model.getRequestURI(), instance: instance}),
					'Error viewing value of attribute', enableButton);
		},
		
		/** Requests and presents the value of the emitter based on the given ValueModel argument. */
		getEmitterValue: function($div, model, value, errorMsg, enableButton) {
			value.fetch({
				success: function(value,response) {
					$div.find('.attributeResult').empty().append( table.valueResponseToTable(model, value) );
					enableButton();
					//Since not a true PSI model, parse() won't be called so logResponse won't be triggered
					value.logResponse(response);
				},
				error: function(value,xhr) {
					client.showErrorAndDialog(errorMsg +
							(xhr.responseJSON ? '' : ': ' + (xhr.responseText.length > 100 ? xhr.responseText.substring(0,100) + '...' : xhr.responseText)),
							xhr.responseJSON);
					enableButton();
				}
			});
		},
		
		deleteResource: function() {
			client.startWorking();
			var what = this.model instanceof models.PredictorModel ? 'predictor' : this.model.get('psiType');
			var model = this.model;
			
			if (model.isJoin()) {
				model.removeJoin(model.id); //will actually be removed from its owner's collection of joins
				client.showMessageDialog('The joined ' + what + ' was successfully deleted');
			} else {
				model.destroy({
					error : function(resp,xhr) { if (xhr.status != 403) client.showErrorAndDialog('Error deleting ' + what, xhr.responseText); },
					success : function() { client.showMessageDialog('The ' + what + ' was successfully deleted'); },
					statusCode: { 403: function() { client.showMessageDialog('This ' + what + ' cannot be deleted'); } }
				});
			}
		},

		render:  function() {
			this.delegateEvents(); //must do this again because the target didn't exist when view first created
			if (this.model == null) {
				this.$el.html( client.infoMessageHTML('Select an attribute to interact with it') );
			} else {
				var attr = this.model.attributesAndID();
				this.$el.html( this.template( _.extend({ emitter: attr }, templates.ViewHelpers) ) + this.interactionTemplate( _.extend({ emitter: attr }, templates.ViewHelpers) ) );
				this.$('.emitterInteractionTabs').tabs();
				//View/apply an attribute; delete an attribute
				var $spinner = $('#' + attr.uriID + '_apply').find('.instance').spinner({ min: 1 });
				var setMax = function(relation) {
					attr.collection = attr.collection || relation; //just set it silently by direct manipulation
					$spinner.spinner('option', 'max', relation.get('size'));
				};
				if (attr.collection)
					setMax(attr.collection);
				else //attribute was loaded independently, so retrieve its relation to obtain size
					new models.RelationModel({ id: attr.relation }).fetch({ success: setMax });
				//TODO If ever support applying queries on lone attributes then must refresh relation details with query args
				
				this.createJoinForm();
			}
			return this;
		},
		
		createJoinForm: function() {
			var model = this.model;
			var $form = this.createPostedForm(this._getInteractionTab('join'), model.getRequestURI(), this.joinRequest, 'Requesting join', 'Error creating join',
					{ 201: function(response, jqXHR) {
						model.recordJoin(jqXHR.getResponseHeader('Location'));
						client.showMessageDialog('Join created successfully and is available at ' + jqXHR.getResponseHeader('Location')); }
					});
			this.bindSelectionPopup( $form.find('input[name="join"]'), 'transformer or predictor', ['transformer','predictor'] );
		},
		
		/**
		 * Generates a json-form whose data will be POSTed to the given URI.
		 * On various success conditions the appropriate handler from
		 * successHandlers will be called. Returns the jQuery-wrapped form.
		 */
		createPostedForm: function($div, uri, def, workingMessage, errorMessage, successHandlers) {
			var action = function(data, $form, enableButton) {
				new models.Request( data ).postRequest(
						_.extend({
							error: function(response) { client.showErrorAndDialog(errorMessage, response); },
							complete: enableButton
						}, successHandlers)
					);
			};
			return this._createForm($div, uri, def, workingMessage, action);
		},
		
		_getInteractionTab: function(forWhat) { return this.$('#' + this.model.uriToID() + '_' + forWhat); },
		
		_createForm: function($div, uri, def, workingMessage, action) {
			var $form = $div.find('form');
			var formDesc = _.extend(new forms.JSONValidatingOnSubmit($form, function(data) {
				var enableButton = psi_ui.newButtonEnabler( $div.find('input[type="submit"]').prop('disabled', true) );
				client.startWorking(workingMessage);
				action(data, $form, enableButton);
			}),
			def );
			formDesc.schema = forms.getSchemaWithURI( uri, forms.getV4CompliantSchema(def.schema) );
			$form.jsonForm( formDesc );
			return $form;
		}
	});
	
	var AttributesView = PSICollectionView.extend({
		title: 'Attributes',
		displayView: psi_ui.ResourceTreeDisplay,
		resourceView: AttributeView,
		className: 'attributesPanel'
	});
	
	var CreateAttributeDialogView = Backbone.View.extend({
		REQUEST_SUBMITTED: 'request-submitted',
		template: templates.get( 'create-attribute-dialog-template' ),
		formData: forms.makeRequestFormData('attribute-definition', null, null /* no help information yet */,
			{
				'description': { type: 'string', title: 'Description' },
				'attribute' : { type: 'string', title: 'Definition', required: true }
			}, { jsonFields: 'attribute', textareas: 'attribute' } ),
		initialize: function() {
			_.extend(this, Backbone.Events);
			this.el.title = 'Create new attribute';
			this.attrTree = new psi_ui.ResourceTreeDisplay({ model: this.model, hideListControls: true });
			forms.addURI( this.formData.schema, this.model.getRequestURI() );
		},
		setModel: function(model) {
			this.model = model;
			this.attrTree.setModel(model);
			//FIXME Probably need to *manually* clear the form of any values entered when looking at another relation model
			this.render();
		},
		events: { 'click button' : 'copyAttrURI' },
		render: function() {
			if (! this.prerendered) { //really only need to do this once
				var dialog = this.$el.html( this.template() );
				var view = this;
				_.extend(this.formData, new forms.JSONValidatingOnSubmit( dialog.find('form'), function(data) {
					dialog.dialog('close');
					view.trigger(view.REQUEST_SUBMITTED, data);
				}) );
				dialog.dialog( new forms.DialogSettings( dialog.find('form').empty().jsonForm( this.formData ) ) );
				this.attrTree.on(this.attrTree.SELECTION_CHANGED, function() { this.prop('disabled', false); }, this.$el.find('button'));
				//The timeout is required because this is triggered by an event that changes the focus, while clicking the button attempts to shift the focus to the text area, something which must therefore be delayed until after the double click event has concluded.
				this.attrTree.on(this.attrTree.RESOURCE_DBL_CLICKED, function() { var btn=this; setTimeout(function(){ btn.click(); }, 0); }, this.$el.find('button'));
				this.$el.find('.attr_tree_mounting_point').append( this.attrTree.render().el );
				this.prerendered = true;
			} else { //due to using same form across multiple relations (there are *some* benefits for users) must manually change the hidden uri field
				this.$el.find('form').find('input[name="uri"]').val( this.model.getRequestURI() );
			}
			//but must do these each time to ensure up-to-date details of sub-attributes and can't paste null attribute selection
//			this.$el.find('.attr_tree_mounting_point').empty().append( this.attrTree.render().el );
			this.$el.find('button').prop('disabled', true);
			return this;
		},
		show: function() { this.render().$el.dialog('open'); },
		copyAttrURI: function() {
			forms.insertTextAtCaret(this.$el.find('textarea[name="attribute"]')[0], '"' + this.attrTree.selectedURI  + '"');
		}
	});
	
	var RelationView = psi_ui.ReusableView.extend({
		queryDialog: null,
		querySchema: null,
		createAttrDialog: null,
		iconName: psi_ui.iconName('relation'),
		initialize: function() {
			var view = this;
			this.querySubmitHandler = function(data) { view.model.applyQueryArgs( data ); view.queryDialog.dialog('close'); };
			psi_ui.ReusableView.prototype.initialize.call(this); //call 'constructor' after queryFormData is ready
		},
		setModel: function(model) {
			this.queryDialog = this.queryFormData = null;
			psi_ui.ReusableView.prototype.setModel.call(this, model);
			if (this.createAttrDialog)
				this.createAttrDialog.setModel(model);
		},
		template: templates.get( 'relation-panel-template' ),
		events: {
			'click .addAttribute' : 'defineAttribute',
			'click .editQuery' : 'editQuery',
			'click .clearQuery' : 'clearQuery'
		},
		editQuery: function() {
			if (! this.queryDialog) {
				this.queryDialog = this.$el.find('.queryDialog').html( templates.get('form-template') );
				this.queryDialog.dialog( new forms.DialogSettings( 
					this.queryDialog.find('form').jsonForm( this.queryFormData )
				) );
			}
			this.queryDialog.dialog('open');
		},
		clearQuery: function() { this.model.applyQueryArgs({}); },
		defineAttribute: function() {
			if (!this.createAttrDialog) {
				this.createAttrDialog = new CreateAttributeDialogView({ el: this.$el.find('.createAttributeDialog'), model : this.model });
				this.createAttrDialog.on(this.createAttrDialog.REQUEST_SUBMITTED, function(data) { this.model.createAttribute(data); } , this);
			}
			this.createAttrDialog.show();
		},
		render: function() {
			//FIXME When should this be called?
			this.delegateEvents();
			if (this.model == null) {
				this.$el.html( client.infoMessageHTML('Select a relation to interact with it') );
			} else {
				//Must be delayed until schema has been compiled, at which point change event should bring us back here
				if (this.model.has('querySchema') && (!_.isEqual(this.model.get('querySchema'), this.querySchema) || this.queryDialog === null)) {
					//Define Edit Query dialog
					this.querySchema = this.model.get('querySchema'); //cache it; only regenerate form when needed
					this.queryFormData = forms.makeFormData(null /* submitted by dialog */, null /* no help information yet */, this.model.get('querySchema'));
					this.queryFormData.onSubmitValid = this.querySubmitHandler;
					this.queryFormData.value = this.model.get('queryArgs');
				}
				//FIXME jsTree appears to need this view to be created here rather than being cached, but this does seem a bit drastic
				//FIXME I suggest using a real rootID
				if (this.attributesView)
					this.attributesView.stopFollowingModel();
				this.attributesView = new AttributesView( { model: this.model, rootID: '' } );
				this.$el.html( this.template( { relation: this.model.attributes } ) );
				this.$('.editQuery').button({ icons: { primary: 'ui-icon-pencil' }, text: false, disabled: ! this.model.has('querySchema') });
				this.$('.clearQuery').button({ icons: { primary: 'ui-icon-circle-close' }, text: false, disabled: ! this.model.has('querySchema') });
				this.$('.detailsTable').after( this.attributesView.render().el );
			}
			return this;
		}
	});
	
	var RelationsView = PSICollectionView.extend({
		title: "Relations",
		resourceView: RelationView
	});
	
	//----Learners-------------------------
	
	var LearnerView = psi_ui.ReusableView.extend({
		iconName: psi_ui.iconName('learner'),
		template: templates.get( 'learner-panel-template' ),
		initialize: function() {
			psi_ui.ReusableView.prototype.initialize.call(this);
			_.extend(this, psi_ui.ResourceFormMixIn);
			this.setPopup( module.clientInstance().getSelectResourceDialog() );
		},
		events: {
			'click .schemaToggle' : 'toggleSchemaHandler',
		},
		render: function() {
			this.delegateEvents(); //must do this again because the target didn't exist when view first created
			if (this.model == null) {
				this.$el.html( client.infoMessageHTML('Select a leaner to interact with it') );
			} else {
				this.$el.html ( this.template( _.extend({ learner: this.model.attributes }, templates.ViewHelpers) ) );
	
				if (this.model.has('taskJSONSchema')) {
					var $form = this.$el.find('form');
					$form.jsonForm( this.createTaskFormData($form) );
					_.each(this.model.get('resourcesJSONSchema').properties, function(schema, resName) {
						this.bindSelectionPopup( $form.find('input[name="resources.' + resName + '"]'), resName, this._getPSIType(schema) );
					}, this);
				}
				this.hideTask();
			}
			return this;
		},
		/**
		 * Original predefined schema included all details, whereas since
		 * draft v4 they can use allOf to 'import' details from another schema
		 * and even oneOf at the top level to say that two alternative
		 * resources would be suitable.
		 */
		_getPSIType: function(schema) {
			if (schema.properties && schema.properties.psiType)
                return schema.properties.psiType.enum[0];
            var of = schema.oneOf || schema.anyOf || schema.allOf;
            if (of) //get first non-null result from looking at other schema (assumption is that they'll all have same psiType)
				return _.find( _.map(of, this._getPSIType, this), _.identity, this);
			return null;
		},
		hideTask: function() { this.$el.find('.taskOutput').fadeOut(); },
		displayTask: function(task) {
			this.$el.find('.taskOutput').fadeIn().find('pre').html( client.ppJSON(task) );
		},
		createTaskFormData: function($form) {
			var view = this;
			var learner = this.model;
			var formTaskSchema = this.model.get('taskJSONSchema');
			var formDesc = forms.makeRequestFormData('task', 'Submit Task', null /* Provide help message? */, formTaskSchema);
	
			var fields = formDesc.form;
			if (!_.isEmpty(this.model.get('paramsSchema'))) {
				//Ensure correct order of fieldsets
				var resPos = fields.indexOf('resources'), paramsPos = fields.indexOf('parameters');
				if (resPos > paramsPos) {
					var temp = fields[resPos]; fields[resPos] = fields[paramsPos]; fields[paramsPos] = temp;
				}
			}
			
			//Indicate not to submit task if user clicks alternative submit button
			var generateOnly = false;
			fields.push( { type: 'button', title: 'Generate Task Only', onClick: function() { generateOnly = true; } } );
	
			forms.addURI(formDesc.schema.properties, learner.getRequestURI());
			_.extend(formDesc, new forms.JSONValidatingOnSubmit($form, function(data) {
				var enableButton = psi_ui.newButtonEnabler( $form.find('input[type="submit"],button').prop('disabled', true) );
				client.startWorking(generateOnly ? 'Generating task' : 'Submitting task');
				learner.resourcesAndParamsToTask(data); //convert from form-friendly structure to task object
				if (generateOnly) {
					generateOnly = false;
					view.displayTask(_.omit(data, 'uri'));
					enableButton();
				} else {
					var req = new models.Request( data );
					req.postRequest({
						201: function(response, jqXHR) {
							var location = jqXHR.getResponseHeader('Location');
							if (learner.has('collection') && learner.get('collection').has('psi'))
								learner.get('collection').get('psi').get('predictors').refresh();
							else //learner was loaded stand alone, so don't know if predictor belongs to a loaded predictors collection
								module.clientInstance().processWebPsiLink( location, true );
							client.showMessageDialog('Predictor created successfully at ' + location);
						},
						202: function(response, jqXHR) {
							learner.jobStarted(jqXHR.getResponseHeader('Location'));
							client.showMessageDialog('Task processing has been accepted by the server. Its progress may be monitored on the Jobs tab.');
						},
						error: function(m, response) { client.showErrorAndDialog('Error processing task', response); },
						complete: enableButton
					});
				}
			}));
			return formDesc;
		}
	});
	
	var LearnersView = PSICollectionView.extend({
		title: "Learners",
		resourceView: LearnerView,
		initialize: function() {
			PSICollectionView.prototype.initialize.call(this);
		}
	});
	
	//----Statuses-------------------------
	
	var RefreshTimer = module.RefreshTimer = function RefreshTimer(duration) {
		if ( !(this instanceof RefreshTimer) ) { throw new Error("Constructor called as a function"); }
		
		this.REFRESH_NOW = 'refreshtimer.refreshnow';
		
		var period = 1000;
		var timer = this;
		
		_.extend(this, Backbone.Events);
		
		this.restart = function () {
			this.curr = new Date(duration * 1000 + period);
			if (this.running)
                this.stopping = true;
            this.running = true;
			this.update();
		};
		
		this.start = this.restart;

		this.update = function() {
			if (this.stopping) {
				this.stopping = false;
				return;
			}
			timer.curr.addMilliseconds(-period);
			if (timer.$display) timer.$display.html( 'Refreshing in ' + timer.curr.toString("mm:ss") );
			if (timer.curr.getTime() > 0) {
				setTimeout(timer.update, period);
			} else {
				timer.running = false;
				timer.trigger(timer.REFRESH_NOW);
			}
		};
		
		this.stop = function() { this.stopping = true; this.running = false; this.curr = new Date(0); };
		
		this.isExpired = function() { return this.curr.getTime() == 0; };
		
		this.setDisplay = function($display) { this.$display = $display; };
	};
	
	var StatusView = psi_ui.ReusableView.extend({
		template: templates.get( 'status-panel-template' ),
		events: { 'click button' : 'refresh' },
		refresh: function() {
			//Could refresh predictors collection and trust that its state won't have changed, but really only should do that if state of job *has* changed
			var predictors = this.model.get('collection').get('psi').get('predictors');
			if (this.model.get('psiType') === 'transformer')
				this.refreshTimer.stop();
			else {
				var refreshTimer = this.refreshTimer;
				this.model.refresh(false, function (model) {
					if (model.get('psiType') === 'transformer')
						predictors.refresh();
					else
						refreshTimer.restart();
				});
			}
		},
		setModel: function(model) {
			if (this.model != model || !this.refreshTimer) {
				//FIXME Find some way to make the RefreshTimer able to be restarted safely
				if (this.refreshTimer) {
					this.refreshTimer.stop();
					this.refreshTimer.off(this.refreshTimer.REFRESH_NOW, this.refresh);
				}
				this.refreshTimer = new RefreshTimer(20);
				this.refreshTimer.on(this.refreshTimer.REFRESH_NOW, this.refresh, this);
				this.refreshTimer.restart();
			}
			psi_ui.ReusableView.prototype.setModel.call(this, model);
		},
		render: function() {
			if (this.model == null) {
				this.$el.html( client.infoMessageHTML('Select a processing job to view its status') );
			} else {
				this.$el.html ( this.template( { status: this.model.attributes } ) );
				this.refreshTimer.setDisplay(this.$el.find('.refresh-in'));
				this.delegateEvents();
			}
			return this;
		}
	});
	
	var JobsView = PSICollectionView.extend({
		title: "Jobs",
		resourceView: StatusView
	});
	
	//----Transformers and Predictors-----------------------
	
	/**
	 * Although transformers are not attributes, the AttributeView provides a
	 * base level of funcionality for 'emitters'.
	 */
	var TransformerView = AttributeView.extend({
		iconName: psi_ui.iconName('transformer'),
		template: templates.get( 'emitter-panel-template' ),
	
		applyRequest: forms.makeRequestFormData('value', 'Apply', null,
					{
						'input': { type: 'string', required: true, title: 'Input value' }
					}, { jsonFields: 'value' } ),
		richApplyRequestFields: {
			'href': { type: 'string', format: 'uri', pattern: '^http://.*|^data:.*', title: 'URI of rich input value' },
			'file': { type: 'file', title: 'Rich input value' }
		},
		
		render: function() {
			this.delegateEvents(); //must do this again because the target didn't exist when view first created
			if (this.model == null) {
				this.$el.html( client.infoMessageHTML('Select a predictor to interact with it') );
			} else {
				var view = this;
				var model = this.model; 
				var transformer = this.model.attributesAndID();
				this.$el.html ( this.template( _.extend({ emitter: transformer }, templates.ViewHelpers) ) + this.interactionTemplate( _.extend({ emitter: transformer }, templates.ViewHelpers) ) );
				this.$('.emitterInteractionTabs').tabs();
				//Apply, join, etc.
				this.createApplyForm();
				this.createJoinForm();
				if (transformer.updateSchema)
					this.createUpdateForm();
			}
			return this;
		},

		createApplyForm: function() {
			if (! this.model.has('accepts')) return;
			var view = this,
				model = this.model,
				what = model instanceof models.PredictorModel ? 'predictor' : 'transformer',
				accepts = this.model.get('accepts'),
				mediaTypes = schema.getMediaTypes(accepts),
				formData, handler;
			//Convoluted, but allows this part of the handler to be written once and used in three different places
			var getEmitterValueWrapper = function(data, $form, enableButton) {
				view.getEmitterValue($form.closest('div'), model, new models.ValueModel(data), 'Error applying ' + what, enableButton);
			};
			if (mediaTypes) {
				formData = forms.makeRequestFormData('value', 'Apply',
					'Apply the ' + what + ' to a rich value with media type ' + (mediaTypes.length == 1? mediaTypes[0] : ' in: ' + mediaTypes.join(', ') +
						'<br>Provide <em>either</em> the URI of a suitable rich value or select a file.'),
					this.richApplyRequestFields);
				handler = function(data, $form, enableButton) {
					var files = $form.find('input[type="file"]')[0].files; //jsonform does not support file fields, so read its value directly
					if ((!data.href && files.length) || (data.href && !files.length)) {
						if (data.href) {
							data.input = encodeURIComponent( data.href );
							getEmitterValueWrapper(data, $form, enableButton);
						} else {
//FIXME Poor or older browsers won't support this, so should not be offered as an option
							var reader = new FileReader();
							reader.onload = function(e) {
								data.input = encodeURIComponent( e.target.result );
								getEmitterValueWrapper(data, $form, enableButton);
							};
							reader.onerror = function(e) { client.showMessageDialog('Unable to read file. JavaScript FileError code ' + e.target.error, 'Error', 'alert'); };
							reader.readAsDataURL(files[0]);
						}
					} else {
						client.showMessageDialog('Exactly one of a rich value URI or a file must be provided');
						enableButton();
					}
				};
			} else {
				this.applyRequest.schema.input.description = 'Must be valid against ' + JSON.stringify(accepts);
				formData = this.applyRequest;
				handler = getEmitterValueWrapper;
			}
			//FIXME Need to be able to insert own validation of the 'value' field
			this._createForm(this._getInteractionTab('apply'), this.model.getRequestURI(), formData, 'Applying transformer to value', handler);
		},

		createUpdateForm: function() {
			var model = this.model;
			var updateRequest = forms.makeRequestFormData('value', 'Update', 'Update the predictor with new training examples.', {
						'valueList': { type: 'array', required: true, title: 'Update values', items: model.get('updateFormSchema') }
					}, { jsonFields: _.map( model.get('updateFormJsonFields'), function(f) { return 'valueList.' + f; } )} );
			//FIXME This assumes that updating modifies the resource, but the PSI spec allows for it to create a new, modified predictor too, so will need to cater for that
			this.createPostedForm(this._getInteractionTab('update'), model.getRequestURI(), updateRequest, 'Updating predictor', 'Error updating predictor',
					{ success: function() { model.refresh(); } });
		}
	});
	
	var PredictorView = TransformerView.extend({
		iconName: psi_ui.iconName('predictor')
	});
	
	var TransformersView = PSICollectionView.extend({
		title: "Transformers",
		resourceView: TransformerView,
		displayView: psi_ui.ResourceTreeDisplay
	});

	var PredictorsView = PSICollectionView.extend({
		title: "Predictors",
		resourceView: PredictorView,
		displayView: psi_ui.ResourceTreeDisplay
	});
	
	//----PSI Service(s)-------------------
	
	var ServiceView = Backbone.View.extend({
		iconName: psi_ui.iconName('service'),
		template: templates.get( 'service-tabs-template' ),
		
		initialize: function() {
			this.id = this.model.uriToID();
			this.model.on('change', this.refreshSubviews, this);
			this.refreshSubviews();
		},
	
		_viewOptions: function(modelName) { return { model: this.model.get(modelName), rootID: this.id, serviceView: this }; },

		_collectionTypes: { 'relations': RelationsView, 'transformers': TransformersView, 'learners': LearnersView,	'predictors': PredictorsView, 'schema': SchemasView	},	
		
		refreshSubviews: function() {
			//Attempt to only refresh what is needed, so on first receive service details or when have added a jobs collection
			if (!this.subviews || this.subviews.length == 0) {
				this.subviews = [];
				_.each(['relations','transformers','learners','predictors','schema'], function(c) {
					if (this.model.has(c))
						this.subviews.push( new this._collectionTypes[c]( this._viewOptions(c) ) );
				}, this);
			} else if (this.model.get('jobs') && ! (_.last(this.subviews) instanceof JobsView) ) {
				var view = new JobsView( this._viewOptions('jobs') );
				this.subviews.push( view );
				this.$el.append( view.render().el );
				psi_ui.insertTab(this.$el, view, view.title);
				//FIXME _May_ have to call view.render() here, although currently it appears to be triggered itself at the right time
				this.showJobs();
				this.model.get('jobs').on('change', this.showJobs, this);
			}
		},
		showJobs: function() { this.$el.tabs('option', 'active', this.subviews.length - 1); },
		render: function() {
			this.$el.html( this.template( { service: this } ) );
			_.each( this.subviews, function(subview) { this.$el.append( subview.render().el ); }, this );
			//FIXME Because this view is being added to another tabbed view, have to delay tabifying this view *sigh*
			var view = this;
			setTimeout(function() { view.$el.tabs() }, 0);
			return this;
		}
	});

	//Extend basic client with templates and other GUI-related functions
	_.extend(client, {
		templates: {
			working: templates.get( 'working-popup-template' ),
			info: templates.get( 'info-template' ),
			error:  templates.get( 'error-template' ),
			message_dialog: templates.get( 'message-dialog-template' ),
			add_resource_dialog: templates.get( 'add-resource-dialog-template' ),
			comms_message: templates.get( 'comms-message-template' )
		},
		infoMessageHTML: function(message) { return this.templates.info({ message: message}); },
		errorMessageHTML: function(message, details) {
			if (typeof(details)==='undefined') details = null;
			return ( this.templates.error(_.extend({ message: message, details: details }, templates.ViewHelpers)) );
		},
		//Replace default showDoingSomething functions
		startWorking: function(message) {
			this.working = true;
			$('#workingPanel').html( this.templates.working({ message: message }) );
			$('#workingPanel').fadeIn();
		},
		stopWorking: function() {
			this.working = false;
			$('#workingPanel').fadeOut();
		},
		showSuccess: function(message) { this.stopWorking(); $('#messagesArea').html( message === undefined ? '' : this.infoMessageHTML(message) ); },
		showError: function(message, details) {
			$('#messagesArea').html( this.errorMessageHTML(message, details) );
		},

		showErrorAndDialog: function(message, response) {
			this.showError(message, response);
			this.showMessageDialog(message, 'Error', 'alert');
		},
		showMessageDialog: function(message, title, type) {
			this.stopWorking();
			var dialog = $(this.templates.message_dialog({ message: message, title: title || 'Information', type: type || 'info'}));
			//Purely for the look of the thing, this estimates the required width of the dialog to show the message without scrollbars
			var $div = $('<div>').append(message).css({ position: 'absolute', width: 'auto', visibility: 'hidden'});
			$('body').append($div);
			var messageWidth = Math.min($div.get(0).clientWidth, window.innerWidth / 2);
			$div.remove();
			dialog.dialog({ modal: true, width: messageWidth + 80, buttons: { OK: function() { dialog.dialog('close'); } }, close: function() { dialog.remove(); } });
		},
		/** Displays a Yes|No confirmation dialog box concerning the addition of a new PSI resource, loaded via a web+psi link; calls yesCallback if user clicks Yes, noCallback otherwise (if the callbacks are defined). */
		showAddResourceDialog: function(uri, model, callbackContext, yesCallback, noCallback) {
			var what = models.responseToName(model);
			var dialog = $(this.templates.add_resource_dialog({ what: what, uri: uri }));
			var buttons = {};
			buttons['Yes, add this ' + what] = function() {
				if (yesCallback) { yesCallback.call(callbackContext, uri); }
				dialog.remove();
			};
			var noHandler = function() {
				if (noCallback) { noCallback.call(callbackContext, uri); };
				dialog.remove();
			};
			buttons['No, do not add this ' + what] = noHandler;
			dialog.dialog({ modal: true, width: 600, close: noHandler, buttons: buttons});
		},

		//For demonstration, not actually for logging; a Client view can post these to a list of some sort to illustrate the communication between the client and server.
		logRequest: function(request, to) { this._logCommunication('request', request, to, false); },
		logResponse: function(response, from, isHeader) { this._logCommunication('response', response, from, isHeader); },
		_logCommunication: function(type, message, uri, isHeader) {
			//TODO Should remove old messages when reach certain limit
			$('#commsLogList').prepend( this.templates.comms_message(_.extend({ type: type, message: message, uri: uri, isHeader: isHeader, timestamp: new Date().toString('HH:mm:ss') }, templates.ViewHelpers) ) );
		}

	});
		
	var ClientView = module.clientView = Backbone.View.extend({
		serviceViews: [],
		events: {
			"click #btnShowComms": "showComms",
		},
		getSelectResourceDialog: function() {
			this.selectResourcePopup = this.selectResourcePopup || this.createSelectResourceDialog();
			return this.selectResourcePopup;
		},
		createSelectResourceDialog: function() { return new psi_ui.SelectResourceDialog({ model: this.model }); },
		initialize: function() {
			this.model = new models.ServicesModel();
			this.model.on(this.model.SERVICE_LOADED, this.serviceLoaded, this);
			document.title = 'PSI Client version ' + client.version;
			$('#attribution').html('PSI Client v' + client.version);
			if (evaluation_ui.ComparisonClientView)
				this.comparisonView = new evaluation_ui.ComparisonClientView({ clientView: this });
			this.render();
			web_psi.ready( this.processWebPsiLink, this );
		},
		_defaultURI: 'http://poseidon.cecs.anu.edu.au',
		render: function() {
			this.tabs = this.$el.find('#serviceTabs');
			var app = this;
			var $form = $('#form-add');
			var formDesc = forms.makeFormData('Connect', null,
				forms.getV4CompliantSchema({ serviceURI: { type: 'string', title: 'PSI service URI', required: true, pattern: '^http://.*', description: 'e.g., http://www.example.org', 'default': this._defaultURI } }) );
			formDesc.onSubmitValid = function(data) {
				$form.find('input').prop('disabled', true);
				if (app.model.contains(data.serviceURI)) {
					forms.displayErrors(app.$el.find('#form-add'), formDesc, { serviceURI: 'Already connected to ' + data.serviceURI });
				} else {
					app.processWebPsiLink(data.serviceURI, true); //allow any PSI resource to be added via this form
				}
				$form.find('input').prop('disabled', false);
			};
			$form.jsonForm( formDesc );
			this.tabs.tabs();
			psi_ui.bindTabClose(this.tabs, this.serviceClosed, this);
			if (this.comparisonView)
				this._insertView(this.comparisonView, 'Compare Predictors', 1, true);
			_.each(this.serviceViews, function(serviceView) { serviceView.render(); });
		},
		/** Originally for processing web+psi links, but now used even to handle service & resource URIs entered into the Add Service form. */
		processWebPsiLink: function(link, noPrompt) {
			var uri = link.replace('web+psi://','http://');
			if (! this.model.contains(uri)) {
				var app = this;
				var resource = new models.Model({ id: uri });
				resource.fetch({
					success: function(model, response, options) {
						if (model.has('psiType')) {
							if (noPrompt)
								app.model.addResource(response);
							else
								client.showAddResourceDialog(link, response, app, function() { app.model.addResource(response); } );
						} else
							client.showMessageDialog('Resource at ' + link + ' does not appear to be a PSI resource (note that PSI Schema resources cannot be added directly): ' + client.ppJSON(response), 'Error', 'alert');
					},
					error: function(model, jqXHR) {
						if (jqXHR.status == 404)
							client.showMessageDialog('Server reports that there is no resource at ' + link , 'Error', 'alert');
						else
							client.showErrorAndDialog('Unable to inspect PSI resource at ' + link, jqXHR);
					}
				});
			} else {
				client.showMessageDialog('Resource at ' + link + ' has already been added', 'Information', 'alert');
			}
		},
//		loadService: function(uri) { this.model.addService(uri.replace('web+psi://','http://')); },
		_viewForModel: function(model) {
			if (model instanceof models.ServiceModel)
				return ServiceView;
			else if (model instanceof models.RelationModel)
				return RelationView;
			else if (model instanceof models.AttributeModel)
				return AttributeView;
			else if (model instanceof models.LearnerModel)
				return LearnerView;
			else if (model instanceof models.TransformerModel)
				return TransformerView;
			else if (model instanceof models.PredictorModel)
				return PredictorView;
			else if (model instanceof models.Collection)
				client.showErrorAndDialog('Unable to support generic PSI Collection resources at this time');
			throw new Error('Unknown or unsupported model type: ' + (typeof model));
		},
		serviceLoaded: function(service, serviceCount) {
			var viewClass = this._viewForModel(service);
			var view = new viewClass({ model: service, id: service.uriToID(), servicesView: this });
			this.serviceViews.push(view);
			this._insertView(view, view.model.id.replace('http://',''), serviceCount - 1);
			this.tabs.tabs('option', 'active', serviceCount - 1);
		},
		serviceClosed: function(idx, viewID) {
			var closedView = this.serviceViews[idx];
			this.serviceViews.splice(idx, 1);
			this.model.removeResource( closedView.model.id );
		},
		_insertView: function(view, title, pos, persistent) {
			psi_ui.insertTab(this.tabs, view, '<span class="ui-icon ui-icon-' + view.iconName + '"></span>' + title, pos, ! persistent);
//FIXME When should render be called on view?
			view.render();
		},
		showComms: function() {
			var btn = $('#btnShowComms').fadeOut();
			var settings = $('#commsLog').hasClass('ui-dialog-content') ? { } : { width: 400, height: 300 }; //only set these first time displayed
			$('#commsLog').dialog(_.extend(settings, { maxHeight: 500, dialogClass: 'shadowDialog', close: function() { btn.fadeIn(); } } ));
		}
	});
	
	module.clientInstance = function(el) {
		module._clientInstance = module._clientInstance || new ClientView(el ? { el : el } : {});
		return module._clientInstance;
	};
	
	return module;

});
