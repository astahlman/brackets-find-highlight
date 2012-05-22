/*
 * Copyright (c) 2012 Adobe Systems. All rights reserved.
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
 *
 */


/*jslint vars: true, plusplus: true, devel: true, nomen: true, regexp: true, indent: 4, maxerr: 50 */
/*global define, brackets, $, window */

/**
 * This module implements incremental searching and highlighting of text matches.
 * Author: tronbabylove
 */
define(function (require, exports, module) {
    'use strict';

	var EditorManager	= brackets.getModule("editor/EditorManager");

	var highlightStartTag;
	var highlightEndTag;
	var currentEditor;

	var dialogBox; // the search dialog
	var $dialogInput; // dialogBox's input field

	/**
	 * Remove the highlight tags from the HTML on close.
	 */
	function _removeHighlights() {
		$(".find-highlight").contents().unwrap();
	}

	/**
	 * Cleanup when finished. Remove dialog box and highlights,
	 * unsubscribe from events.
	 */
	function _close() {
		if (dialogBox) {
			$dialogInput.off("blur");
			dialogBox.parentNode.removeChild(dialogBox);
			dialogBox = null;
		}
		EditorManager.focusEditor();
		_removeHighlights();
		$(currentEditor).off("scroll");
	}


	/**
	 * Returns the range of lines currently visible in the editor.
	 * @return {{first : number, last : number}} the range, in lines
	 */
	function _getVisibleRange() {
		var lastIndex = currentEditor.$numbersNode.children().length - 1;
		var start = parseInt(currentEditor.$numbersNode.children()[1].innerHTML, 10) - 2;
		var end = parseInt(currentEditor.$numbersNode.children()[lastIndex].innerHTML, 10) - 1;
		return { first : start, last : end };
	}

	/**
	 * Gets the text that is visible in the editor.
	 * @return {string} the visible text 
	 */
	function _getVisibleText() {
		var range = _getVisibleRange();
		var i, visibleText = "";
		for (i = range.first; i <= range.last; i++) {
			visibleText += currentEditor.getLineText(i) + "\n";
		}
		return visibleText;
	}

	/**
	 * Returns the length of html special chars after conversion
	 * @param {string} of length 1
	 * @return {number} the converted with of the character, or null
	 * if the char is not a html special char
	 */
	function _widthForSpecial(c) {
		if (c === "<" || c === ">") {
			return 4;
		} else if (c === "&") {
			return 5;
		} else {
			return null;
		}
	}


	/**
	 * Returns the adjusted length of a string accounting for html special chars
	 * @param {string} raw (non-html) string
	 * return {number} the length of the string after converting html special chars
	 */
	function _getMatchWidth(s) {
		var i = 0, total = 0;
		var n;
		for (i = 0; i < s.length; i++) {
			n = _widthForSpecial(s.substring(i, i + 1));
			n = (n !== null) ? n : 1;
			total += n;
		}
		return total;
	}


	/**
	 * Returns an array with an element for each line containing one or more matches.
	 * Each element stores the line number, an array of char offsets for
	 * each match, an array of lengths for each match and the line text.
	 * @param {string} the document contents
	 * @param {RegExp} the query regular expression 
	 * @return {Array: {line : {number},  offsets : {Array : {number}}, lengths : {Array : {number}}, text : {string} }}
	 */
	function _getSearchMatches(contents, queryExpr) {

		function getLineNum(offset) {
			return contents.substr(0, offset).split("\n").length - 1; // 0 based linenum
		}
		function getLine(lineNum) {
            // Future: cache result
            return contents.split("\n")[lineNum];
        }
		// Quick exit if not found
		if (contents.search(queryExpr) === -1) {
			return null;
		}

		var matches = [];
		var lineIndex = -1;
		var ch, length, lineNum, match;
		var results = [];
		while ((match = queryExpr.exec(contents)) !== null) {
			lineNum = getLineNum(match.index);
			ch = match.index - contents.lastIndexOf("\n", match.index) - 1;  // 0-based index
			length = _getMatchWidth(match[0]);

			// check if this is a new line
			if (results.length === 0 || lineNum !== results[lineIndex].line) {
				lineIndex++;
				results[lineIndex] = {line : lineNum, offsets : [], lengths : [], text : getLine(lineNum)};
			}

			results[lineIndex].line = lineNum;
			results[lineIndex].offsets.push(ch);
			results[lineIndex].lengths.push(length);
		}

		return results;
	}

	/**
	 * Utility function for shifting match offsets.
	 * @param {Array:{number}} the char offsets of the matches in the line	
	 * @param {number} shift the offsets in the array from this index onward
	 * @param {number} the number of places to shift the offsets
	 * @return {Array:{number}} the shifted offsets
	 */
	function _shiftMatches(offsets, start, width) {
		var i;
		for (i = start; i < offsets.length; i++) {
			offsets[i] += width;
		}
		return offsets;
	}

	/**
	 * Utility function for shifting the tag matches.
	 * @param {Array: {start : {number}, shift : {number}} an array of tags containing 
	 * the offsets and lengths of the tags
	 * @param {number} shift the offsets of the tag start offsets in the array from this index onward
	 * @param {number} the number of places to shift the tag start offsets
	 * @return {Array: {start : {number}, shift : {number}} the shifted tag array
	 */
	function _shiftTags(tags, start, width) {
		var i;
		for (i = start; i < tags.length; i++) {
			tags[i].start += width;
		}
		return tags;
	}

	/**
	 * Inserts the highlight start and end tags into the text.
	 * @param {string} the text
	 * @param {number} the offset where the highlight start tag will be inserted
	 * @param {number} the offset where the highlight end tag will be inserted
	 * @return {string} the text with the tags inserted
	 */
	function _insertTags(text, start, end) {
		return text.substring(0, start) + highlightStartTag + text.substring(start, end) + highlightEndTag + text.substring(end);
	}

	/**
	 * Inserts the highlight start tag into the text.
	 * @param {string} the text
	 * @param {number} the offset where the highlight start tag will be inserted
	 */
	function _insertStartTag(text, start) {
		return text.substring(0, start) + highlightStartTag + text.substring(start);
	}

	/**
	 * Inserts the highlight end tag into the text.
	 * @param {string} the text
	 * @param {number} the offset where the highlight end tag will be inserted
	 */
	function _insertEndTag(text, start) {
		return text.substring(0, start) + highlightEndTag + text.substring(start);
	}

	/**
	 * Returns an array of offsets and lengths for each html
	 * tag in a single line of text
	 * @param {string} an html string
	 * @return {Array: {start : {number}, shift : {number}} an array containing
	 * the tag start offsets and lengths
	 */
	function _findTags(html) {
		var getTags = new RegExp("<[^>]+>", "g");
		var match;
		var tags = [];
		while ((match = getTags.exec(html)) !== null) {
			tags.push({ start : match.index, shift: match[0].length});
		}

		return tags;
	}

	/**
	 * Takes an array of match offsets and adjusts them to account
	 * for html special chars.
	 * @param {Array:{number}} the offsets of the matches
	 * @param {string} the original (non-html) line of text from the document
	 * @return {Array:{number}} the shifted offsets of the matches
	 */
	function _shiftResultForSpecial(offsets, line) {

		function findSpecial(text) {
			var getSpecial = new RegExp("&|<|>", "g");
			var match;
			var special = [];
			while ((match = getSpecial.exec(text)) !== null) {
				special.push({ start : match.index, shift : _widthForSpecial(match[0]) - 1 });
			}

			return special;
		}

		var s = 0, r = 0;
		var special = findSpecial(line);
		while (s < special.length && r < offsets.length) {
			if (special[s].start < offsets[r]) {
				offsets = _shiftMatches(offsets, r, special[s].shift);
				special = _shiftTags(special, s + 1, special[s].shift);
				s++;
			} else if (offsets[r] <= special[s].start) {
				r++;
			}
		}
		return offsets;
	}

	/**
	 * Takes an array of match offsets and adjusts them to account
	 * for document tab characters. The editor counts tabs as one char
	 * but the html has 4 spaces.
	 * @param {Array:{number}} the match offsets
	 * @param {string} the original (non-html) line of text from the document
	 */
	function _shiftResultForTabs(offsets, line) {
		var tabs = line.match(/\t/g) || [];
		// we count each tab as one char, so we must shift by 3 
		// (1 + 3) = 4 spaces per tab in the html
		return _shiftMatches(offsets, 0, tabs.length * 3);
	}

	/**
	 * Converts the raw query string to a RegExp, if necessary
	 * Taken from FindInFiles.js
	 * @param {string} the query string
	 * @return {RegExp} the RegExp for the given query
	 */
	function _getQueryRegExp(query) {
        // If query is a regular expression, use it directly
        var isRE = query.match(/^\/(.+)\/(g|i)*$/);
        if (isRE) {
            // Make sure the 'g' flag is set
            var flags = isRE[2] || "g";
            if (flags.search("g") === -1) {
                flags += "g";
            }
            return new RegExp(isRE[1], flags);
        }

        // Query is a string. Turn it into a case-insensitive regexp

        // Escape regex special chars
        query = query.replace(/(\(|\)|\{|\}|\[|\]|\.|\^|\$|\||\?|\+|\*)/g, "\\$1");
        return new RegExp(query, "g");
    }

	/**
	 * Performs the highlighting of matches. As this algorithm is relatively complex,
	 * it is explained in detail below.
	 *
	 * Approach: Get the line numbers, offsets and lengths of the matches
	 * for each line in the raw document text. For each line with a match,
	 * shift the match offsets to account for html special chars, if necessary.
	 * Next, for each line with a match, search the line's corresponding html
	 * And get the offsets and lengths of the span tags. Now we must
	 * parse the line by incrementally shifting the match offsets for each span tag
	 * we encounter. When we encounter a match, there are two possible cases:
	 * 1. The match is continuous
	 * 2. The match is interrupted by a span tag.
	 * In the first case, we simply insert the opening highlight tag at the match offset
	 * and insert the ending highligt tag at the end of the match. The second case is more
	 * complicated. Imbalanced tags are disallowed, or the easiest solution would be to just
	 * skip over the interrupting span tag and place the closing highlight tag after it.
	 * Instead, when we encounter a span tag in the middle of a match, we must close the
	 * highlight tag, skip over the span tag, and then reopen the highlight tag after the
	 * span tag.
	 * @param {string} the original (non-html) text
	 * @param {string} the raw query string
	 */
	function _doHighlight(contents, query) {
		var results = _getSearchMatches(contents, _getQueryRegExp(query));
		if (results) {
			results.forEach(function (result) {
				// shift the offsets to account for html special char expansion:
				// i.e., '&' -> '&amp;'
				result.offsets = _shiftResultForSpecial(result.offsets, result.text);
				result.offsets = _shiftResultForTabs(result.offsets, result.text);
				var n = currentEditor.$textNode.children()[result.line];
				var lineHTML = n.innerHTML;
				var tags = _findTags(lineHTML);
				var t = 0, m = 0;
				while (t < tags.length && m < result.offsets.length) {
					// next tag is before next match
					if (tags[t].start <= result.offsets[m]) {
						result.offsets = _shiftMatches(result.offsets, m, tags[t].shift);
						t++;
					// next tag comes before the end of this match
					} else {
						lineHTML = _insertStartTag(lineHTML, result.offsets[m]);
						result.offsets = _shiftMatches(result.offsets, m, highlightStartTag.length);
						tags = _shiftTags(tags, t, highlightStartTag.length);
						// while there are tags before the end of the match
						while (t < tags.length && (result.offsets[m] + result.lengths[m]) > tags[t].start) {
							// insert end tag, shift offsets and add to match length
							lineHTML = _insertEndTag(lineHTML, tags[t].start);
							result.offsets = _shiftMatches(result.offsets, m + 1, highlightEndTag.length);
							tags = _shiftTags(tags, t, highlightEndTag.length);
							result.lengths[m] += highlightEndTag.length;
							// insert start tag after the encountered tag, shift offsets and add to match length
							lineHTML = _insertStartTag(lineHTML, tags[t].start + tags[t].shift);
							result.offsets = _shiftMatches(result.offsets, m + 1, tags[t].shift + highlightStartTag.length);
							tags = _shiftTags(tags, t + 1, highlightStartTag.length);
							result.lengths[m] += tags[t].shift + highlightStartTag.length;
							t++;
						}
						lineHTML = _insertEndTag(lineHTML, result.offsets[m] + result.lengths[m]);
						result.offsets = _shiftMatches(result.offsets, m + 1, highlightEndTag.length);
						tags = _shiftTags(tags, t, highlightEndTag.length);
						m++;
					}
				}
				// if there are still matches left, then there can't be any tags left - highlight is straightforward
				var i = 0;
				for (i = m; i < result.offsets.length; i++) {
					lineHTML = _insertTags(lineHTML, result.offsets[i], result.offsets[i] + result.lengths[i]);
					result.offsets = _shiftMatches(result.offsets, i + 1, highlightStartTag.length + highlightEndTag.length);
				}
				n.innerHTML = lineHTML;
			});
		}
	}

	/**
	 * Pulls the raw query string from the dialog input
	 * and highlights the visible text area.
	 */
	function _startFind() {
		function isValidQuery(s) {
			var match = s.match(/^[\s]*$/g);
			return match ? false : true;
		}

		if ($dialogInput && currentEditor) {
			var text = _getVisibleText();
			var rawQuery = $dialogInput.val();
			var query = isValidQuery(rawQuery) ? rawQuery : "";
			if (query.length > 0) {
				_doHighlight(text, query);
			}
		}
	}

	/**
	 * Handle the editor changed event. Update the current editor
	 * and store the child nodes we use to extract the editor contents.
	 */
	function _onEditorChanged() {
		_close();
		currentEditor = EditorManager.getCurrentFullEditor();

		currentEditor.$textNode = $(currentEditor.getRootElement()).find(".CodeMirror-lines");
		currentEditor.$textNode = $(currentEditor.$textNode.children()[0].children[3]);
		currentEditor.$numbersNode = $(currentEditor.getRootElement()).find(".CodeMirror-gutter-text");

		
	}

	/**
	 * Initialize the module.
	 * @param {string} the html tag to use for the opening of highlights
	 * @param {string} the html tag to use for the closing of highlights
	 */
	function loadModule(startTag, endTag) {
		if (startTag && endTag) {
			highlightStartTag = startTag;
			highlightEndTag = endTag;
		} else {
			highlightStartTag = "<mark class='find-highlight' style='background-color: #FFFF00'>";
			highlightEndTag = "</mark>";
		}
		currentEditor = EditorManager.getCurrentFullEditor();

		$(EditorManager).on("focusedEditorChange", function () {
			_onEditorChanged();
		});
	}


	/**
	 * Add the search dialog box to the editor and register for 
	 * scroll and keypress events.
	 */
	function addSearchBar() {
		if (currentEditor) {
			var dialogHTML = 'Find: <input type="text" autocomplete="off" id="find-highlight-input" style="width: 30em">';
			var $wrap = $("#editor-holder")[0];

			dialogBox = $wrap.insertBefore(window.document.createElement("div"), $wrap.firstChild);
			dialogBox.className = "CodeMirror-dialog";
			dialogBox.innerHTML = '<div>' + dialogHTML + '</div>';
			$dialogInput = $("#find-highlight-input");
			$dialogInput.focus();
			$dialogInput.on("blur", function () { _close(); });

			$(currentEditor).on("scroll", function () {
				_removeHighlights();
				_startFind();
			});

			$dialogInput.on("keydown", function (e) {
				if (e.which === 13 || e.which === 27) {
					e.preventDefault();
					e.stopPropagation();
					_close();
				}
			});
			$dialogInput.on("keyup", function () {
				_removeHighlights();
				_startFind();
			});
		}
	}

	exports.loadModule = loadModule;
	exports.addSearchBar = addSearchBar;

});
