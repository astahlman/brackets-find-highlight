/*
 * Copyright (c) 2012 Andrew Stahlman. All rights reserved.
 *
 * Permission is hereby granted, free of charge, to any person obtaining a
 * copy of this software and associated documentation files (the "Software"), 
 * to deal in the Software without restriction, including without limitation 
 * the rights to use, copy, modify, merge, publish, distribute, sublicense, 
 * and/or sell copies of the Software, and to permit persons to whom the 
 * Software is furnished to do so, subject to the following conditions:
 *  
 * The above copyright notice and this permission notice shall be included in
 * all copies or substantial portions of the Software.
 *  
 * THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
 * IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY, 
 * FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
 * AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER 
 * LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING 
 * FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER 
 * DEALINGS IN THE SOFTWARE.
 */

/*jslint vars: true, plusplus: true, devel: true, nomen: true, indent: 4, maxerr: 50 */
/*global define, brackets, $, window */

define(function (require, exports, module) {
    'use strict';

    var Commands                = brackets.getModule("command/Commands"),
        CommandManager          = brackets.getModule("command/CommandManager"),
        KeyBindingManager       = brackets.getModule("command/KeyBindingManager"),
        KeyMap                  = brackets.getModule("command/KeyMap");

	var FindHighlightManager 	= require("FindHighlightManager");

	exports.FIND_HIGHLIGHT = "find.highlight";

	function handleStartFind() {
		FindHighlightManager.addSearchBar();
	}

	function init() {
		
		//add the keybinding
        var currentKeyMap = KeyBindingManager.getKeymap(),
            key = "",
            newMap = [],
            newKey = {};
        
        currentKeyMap['Ctrl-Shift-P'] = exports.FIND_HIGHLIGHT;
        
        for (key in currentKeyMap) {
            if (currentKeyMap.hasOwnProperty(key)) {
                newKey = {};
                newKey[key] = currentKeyMap[key];
                newMap.push(newKey);
            }
        }
        var _newGlobalKeymap = KeyMap.create({
                "bindings": newMap,
                "platform": brackets.platform
            });
        KeyBindingManager.installKeymap(_newGlobalKeymap);

		FindHighlightManager.loadModule();
	}

	init();
	
	CommandManager.register(exports.FIND_HIGHLIGHT, handleStartFind);
});
