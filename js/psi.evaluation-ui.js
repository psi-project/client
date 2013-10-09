/*
 * PSI Evaluation module GUI 0.6
 * 
 * Author: James Montgomery (james.montgomery at anu.edu.au)
 * 
 * Developed as part of the Protocols and Structures for Inference project: http://psi.cecs.anu.edu.au
 */

define(['jquery','underscore','backbone','psi.client','psi.common-ui','psi.evaluation','psi.forms','psi.schema','psi.templates','jsonform','date'],
function($, _, Backbone, client, psi_ui, evaluation, forms, psi_schema, templates) {
	var module = {};

	$.support.cors = true;

	module.ComparisonClientView = Backbone.View.extend({
		iconName: 'flag',
		id: 'predictor_comparator',
		template: templates.get( 'comparison-panel-template' ),
		reportTemplate: templates.get( 'comparison-report-template' ),
		comparisonForm: forms.makeFormData('Compare', null,
			forms.getV4CompliantSchema({
			sourceAttribute: { type: 'string', required: true, title: 'Instance data attribute', pattern: '^http://.*', description: 'URI of attribute for values on which to predict', 'default': 'http://poseidon.cecs.anu.edu.au/data/iris/featuresNoClass' },
			targetAttribute: { type: 'string', required: true, title: 'Instance label attribute URI', pattern: '^http://.*', description: 'URI of attribute for correct answers', 'default': 'http://poseidon.cecs.anu.edu.au/data/iris/species' },
			predictors: { type: 'array', required: true, title: 'Predictors to compare', items: { type: 'string', pattern: '^http://.*', description: 'Predictor\'s URI', 'default': 'http://poseidon.cecs.anu.edu.au/predictor/j48_iris_20130212084602138' } }
		})),
		initialize: function() {
			if (this.options.clientView) {
				_.extend(this, psi_ui.ResourceFormMixIn);
				this.setPopup( this.options.clientView.createSelectResourceDialog() );
				var schema = this.comparisonForm.schema;
				var attrs = psi_schema.getJSONSchemaVersion() === psi_schema.JSONSchemaVersions.DRAFTV3 ? schema : schema.properties;
				delete attrs.sourceAttribute['default'];
				delete attrs.targetAttribute['default'];
				delete attrs.predictors.items['default'];
			} else {
				document.title = 'PSI Predictor Comparison Tool';
				$('#attribution').html(document.title + ' v' + client.version);
				this.render();
			}
		},
		render: function() {
			var view = this;
			this.$el.html( this.template({ standalone : ! this.options.clientView }) );
			var $form = this.$el.find('#comparison-form');
			var submitBtn = $form.find('input[type="submit"]');
			submitBtn.prop('disabled', true);
		   	var enableButton = function() { submitBtn.prop('disabled', false); client.stopWorking(); };
			_.extend(this.comparisonForm, new forms.JSONValidatingOnSubmit($form, function(data) {
				data.predictors = _.compact(data.predictors); //remove any empty values
				client.startWorking('Performing comparison of ' + data.predictors.length + ' predictors');
				var predComparator = new evaluation.PredictorComparator(data);
				var reportDiv = $('.reportPanel').removeClass('inline-block');
				var progressArea = view.$el.find('#progressArea');
				var progressBox = view.$el.find('#progressBox');
				var showProgress = function(message, done) {
					if (!done) client.startWorking(message);
					progressArea.append(new Date().toString('yyyy-MM-dd HH:mm:ss') + ': ' + message+'<br/>');
					progressBox.animate({ scrollTop: progressBox.prop('scrollHeight') }, 50);
				};
				predComparator.on(predComparator.START, function() { progressArea.empty(); });
				predComparator.on(predComparator.PROGRESS, showProgress);
	
				$.when( predComparator.run() )
					.done( function() {
						showProgress('Finished: Mean ' + predComparator.lossName + ' across all ' + data.predictors.length + ' predictors is ' + predComparator.meanLoss);
						reportDiv.html( view.reportTemplate({ title: 'Comparison Report', tester: predComparator }) ).addClass('inline-block');
						if (predComparator.results.length) {
							var div = reportDiv.find('.additionalReports');
							if (predComparator.getChartCount() > 0) {
								div.append('<h3>Comparison Charts</h3>');
								predComparator.generateCharts(div);
							}

							//FIXME Perhaps isolate this from the view a bit more
							if (predComparator.results[0].outcome instanceof evaluation.ClassificationResult) {
								div.append('<h3>Confusion matrices</h3>');
								_.each(predComparator.results, function(r) {
									div.append( new evaluation.ConfusionMatrixDisplay(r.outcome, r.predictor).$el );
								});
							}
						}
					} )
					.always( enableButton );
			}));
			$form.empty().jsonForm( this.comparisonForm );

			//Bind selection popup, if available
			if (this.selectResourcePopup) {
				this.bindSelectionPopup( $form.find('input[name="sourceAttribute"]'), 'source data', 'attribute');
				this.bindSelectionPopup( $form.find('input[name="targetAttribute"]'), 'target label', 'attribute');
				this.bindPredictorPopups( $form );
				//FIXME Is there a cleaner way to monitor add button click, especially a way to avoid the timeout?
				$form.find('a._jsonform-array-addmore').on('click', function() { setTimeout( function() { view.bindPredictorPopups($form); }, 50); });
			}
		},
		bindPredictorPopups: function($form) {
			this.bindSelectionPopup( $form.find('input[name^="predictor"]').last(), 'a predictor', 'predictor');
		}
	});

	return module;
});
