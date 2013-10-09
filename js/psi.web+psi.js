/*
 * PSI web+psi Pseudo-protocol Client-side Handler 0.2
 * 
 * Author: James Montgomery (james.montgomery at anu.edu.au)
 * 
 * Developed as part of the Protocols and Structures for Inference project: http://psi.cecs.anu.edu.au
 */
 
define(['jquery','underscore','bncconnector'], function($, _) {
	var module = {};

	module.getClientURI = function() {
		return 'http://psi.cecs.anu.edu.au/demo';
	};

	try {
		//Request that the actual web+psi handler be registered to handle web+psi links
		if (navigator && navigator.registerProtocolHandler)
			navigator.registerProtocolHandler('web+psi', module.getClientURI() + '/handler.html?uri=%s', 'Protocols & Structures for Inference Explorer');
	} catch (e) {
		console.log('Unable to request registration of web+psi handler: ' + e);
	}

	/**
	 * The PSI Client should call this when it is ready to begin receiving
	 * web+psi links. The required argument is the function to pass incoming
	 * links to.
	 */
	module.ready = function(handler, context) {
		BNCConnectorMonitor.start();
		var conn = module.connector = new BNCConnector("p1");
		conn.listen = function(who, msg) {
			if (who === 'p0') {
				handler.call(context, msg);
			}
		};
		conn.sendData('p0', 'Started');
	};

	//Ensures that the cookies used by BNCConnector are cleared so that the main handler will know the client is not running
	$(window).unload(function () {
		//FIXME Do a check to see how many *other* clients are running, and only unregister this one if it's the only one (this is why underscore requirement has been left above)

		//TODO Try removing this and reloading handler until can reproduce situation where name p1 is still in cookies but client window has been closed in order to name error condition in handler.
		BNCConnectorMonitor.unregister('p1');
	});

	return module;

});
