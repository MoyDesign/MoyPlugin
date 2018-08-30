/*!
 * jQuery htmlDoc "fixer" - v0.2pre - 8/8/2011
 * http://benalman.com/projects/jquery-misc-plugins/
 *
 * Copyright (c) 2010 "Cowboy" Ben Alman
 * Dual licensed under the MIT and GPL licenses.
 * http://benalman.com/about/license/
 */

(function($) {
  // RegExp that matches opening and closing browser-stripped tags.
  // $1 = slash, $2 = tag name, $3 = attributes
  var matchTag = /<(\/?)(html|head|body|title|base|meta)(\s+[^>]*)?>/ig;
  // Unique id prefix for selecting placeholder elements.
  var prefix = 'hd' + +new Date;
  // A node under which a temporary DOM tree can be constructed.
  var parent;

  $.htmlDoc = function(html) {
    // A collection of "intended" elements that can't be rendered cross-browser
    // with .innerHTML, for which placeholders must be swapped.
    var elems = $();
    // Input HTML string, parsed to include placeholder DIVs. Replace HTML,
    // HEAD, BODY tags with DIV placeholders.
    var htmlParsed = html.replace(matchTag, function(tag, slash, name, attrs) {
      // Temporary object in which to hold attributes.
      var obj = {};
      // If this is an opening tag...
      if ( !slash ) {
        // Add an element of this name into the collection of elements. Note
        // that if a string of attributes is added at this point, it fails.
        elems = elems.add('<' + name + '/>');
        // If the original tag had attributes, create a temporary div with
        // those attributes. Then, copy each attribute from the temporary div
        // over to the temporary object.
        if ( attrs ) {
          $.each($('<div' + attrs + '/>')[0].attributes, function(i, attr) {
            obj[attr.name] = attr.value;
          });
        }
        // Set the attributes of the intended object based on the attributes
        // copied in the previous step.
        elems.eq(-1).attr(obj);
      }
      // A placeholder div with a unique id replaces the intended element's
      // tag in the parsed HTML string.
      return '<' + slash + 'div'
        + (slash ? '' : ' id="' + prefix + (elems.length - 1) + '"') + '>';
    });

    // If no placeholder elements were necessary, just return normal
    // jQuery-parsed HTML.
    if ( !elems.length ) {
      return $(html);
    }
    // Create parent node if it hasn't been created yet.
    if ( !parent ) {
      parent = $('<div/>');
    }
    // Create the parent node and append the parsed, place-held HTML.
    parent.html(htmlParsed);
    // Replace each placeholder element with its intended element.
    $.each(elems, function(i) {
      var elem = parent.find('#' + prefix + i).before(elems[i]);
      elems.eq(i).html(elem.contents());
      elem.remove();
    });
    // Return the topmost intended element(s), sans text nodes, while removing
    // them from the parent element with unwrap.
    return parent.children().unwrap();
  };

}(jQuery));
