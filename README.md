# Moy.Design browser plugin

**Moy.Design** (or **Moy** for short) browser plugin allows you to change the appearance of your favorite websites. It serves a number of purposes:

* Provide a way to see information from different websites in a unified way, which is customizable by end users.
* Make web pages lighter, with less scripts, images, styling and other heavy and often unnecessary stuff.
* Make web pages more readable, human-friendly, eye-friendly.
* Make web pages mobile-friendly.

## Installation and usage

The plugin's available for Chrome and Firefox (*including Firefox for Android*):

* [Install for Chrome](https://chrome.google.com/webstore/detail/moydesign/kgepfphemgiidklhpnfoobmoieiglgon)
* [Install for Firefox (desktop and Android)](https://moy.design/extension/firefox)

If everything's OK, you should see something like this next time you click the plugin's icon:

<img src="https://raw.githubusercontent.com/MoyDesign/MoyDocs/master/docs/plugin-popup.png" height="300">

These buttons represent alternative looks available for this page. For some pages, only `Original look` is available. When you press a button, the page will be reloaded with the chosen look, and your choice is remembered. I.e. next time you load this (or similar) page, it'll be shown with the selected look.

When the plugin's installed, it will show welcome page with some examples to test it on.

The number of supported websites is growing. If the plugin doesn't support your favourite website yet, just [ask about it](#get-help).

## Get help

If something is unclear or seems buggy (e.g. the plugin shows no looks for a page or renders a page incorrectly), please feel free to

* [file an issue](https://github.com/MoyDesign/MoyPlugin/issues)
* ask for help in the [mailing list](https://groups.io/g/moy)
* ask for help directly: [info@moy.design](mailto:info@moy.design)
* contact [me](https://github.com/dsavenko) personally.

## Technical overview

The plugin uses <i>parsers</i> to extract valuable information from original pages and <i>templates</i> (or <i>'looks'</i>) to render the information.

Parsers and templates are located in the <a href='https://github.com/MoyDesign/MoyData'>MoyDesign's</a> MoyData GitHub repository. The plugin downloads them <b>all</b> the first time when it's installed. Then, it periodically checks for updates.

You can specify another GitHub account. This is useful for creating your own parsers and templates: just fork the main MoyData repo and point the plugin to your own account. Please, consider making a pull request to the original repo afterwards.

Detailed documentation about the plugin, including how to create your own parsers and templates, is available <a href='https://github.com/MoyDesign/MoyDocs/blob/master/README.md#moydesign-documentation'><b>here</b></a>.

Happy hacking! :)
