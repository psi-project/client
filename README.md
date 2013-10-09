# PSI Explorer Client (plus Predictor Evaluation Tool)

The [_Protocols and Structures for Inference_](http://psi.cecs.anu.edu.au) project aims to develop a general purpose web API for machine learning. This JavaScript client provides an 'explorer' interface for communicating with full-blown PSI services and individual PSI resources (relations, attributes, learners, predictors, etc.).

It has been designed to support demonstrations of the API's behaviour to technically-minded, often machine learning-oriented, people. It is thus not a production-quality end user application, but parts of the system could be used to build one.

## Dependencies

The app uses [RequireJS](http://requirejs.org/) for module management. In addition to the widely-used jQuery, Backbone and Underscore packages, it uses the [JSON Form](https://github.com/joshfire/jsonform) package to generate and validate forms using JSON Schema and a version of Geraint Luff's [Tiny Validator (for v4 JSON Schema)](https://github.com/geraintluff/tv4). The tv4 package has been modified to report multiple errors, instead of just the first one, so that it can be used in place of [JSV](https://github.com/garycourt/JSV), which only supports JSON Schema up to draft version 3.

## Predictor Comparison tool

The client includes a comparison tool that illustrates how one or more predictors may be evaluated via a series of interactions with the server. This tool is relatively separate from the 'explorer' part of the client.

## web+psi links

To demonstrate what the internet might look like with ubiquitous machine learning services, in compliant browsers the app requests to [register a protocol handler](https://developer.mozilla.org/en-US/docs/Web/API/navigator.registerProtocolHandler) for web+psi links. It uses [BNC Connector](http://theprivateland.com/bncconnector/index.htm) to communicate between a handler page and an open client app, since the browser will open a new page to process each link, whereas the client has been designed to work with multiple clients simultaneously.

Note that, [due to security restrictions](https://developer.mozilla.org/en-US/docs/Web/API/navigator.registerProtocolHandler), the protocol handler (specified in `js/web+psi.js`) must reside at the same location from which the client is being served. 

Assuming you have previously registered a protocol handler for web+psi links, the following should load the project's demonstration service into a new client or an already open client:

<web+psi://poseidon.cecs.anu.edu.au>

## Further documentation

Further documentation may be provided in the future.
