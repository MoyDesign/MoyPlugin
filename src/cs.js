/*
Copyright (c) 2018 Dmitry Savenko <ds@dsavenko.com>

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
*/

/* global MoyParser, parserOptions, Handlebars, compiledTemplateSpec, $ */

'use strict'

!(function() {

    let observer = null

    // parserOptions is injected by the background script
    const parser = new MoyParser(parserOptions)

    function findAnchorElem() {
        const anchor = location.hash.substring(1)
        let el = document.getElementById(anchor)
        if (!el) {
            const elems = document.getElementsByName(anchor)
            if (0 < elems.length) {
                el = elems[0]
            }
        }
        return el
    }

    function scrollToHash() {
        try {
            const anchorElem = findAnchorElem()
            if (anchorElem) {
                anchorElem.scrollIntoView()
            } else {
                window.scrollTo(0, 0)
            }
        } catch (e) {
            console.log('Failed to scroll to hash', e)
        } finally {
            if (observer) {
                observer.disconnect()
                observer = null
            }
        }
    }

    function renderPage(pageHtml) {
        const hd = $.htmlDoc(pageHtml)
        $(document.documentElement).empty()
        observer = new MutationObserver(scrollToHash)
        observer.observe(document.documentElement, {childList: true})
        $(document.documentElement).append(hd.find('body'))
        $(document.documentElement).append(hd.find('head'))
    }

    function customArrayToString() {
        return this.join(' ')
    }

    function isObject(v) {
        return v === Object(v)
    }

    function polishToken(token) {
        if (Array.isArray(token)) {
            token.toString = customArrayToString
            token.forEach(polishToken)
        }
        if (isObject(token)) {
            Object.values(token).forEach(polishToken)
        }
        return token
    }

    function moy() {
        const fullUrl = window.location.href
        const baseUrl = window.location.origin
        if (parser.isMatch(fullUrl)) {
            const parsedData = parser.parse()
            const tokens = {
                BASE_URL: [baseUrl],
                FULL_URL: [fullUrl]
            }
            for (const [name, value] of parsedData.content) {
                tokens[name] = polishToken(value)
            }
            // compiledTemplateSpec is injected by the background script
            setTimeout(renderPage, 50, Handlebars.template(compiledTemplateSpec)(tokens))
        }
    }

    moy()
})()
