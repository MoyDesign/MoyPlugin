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

'use strict'

function renderPage(pageHtml) {
    document.documentElement.innerHTML = pageHtml
}

let oldUrl = window.location.href
let pageMoyed = false

// parserOptions is injected by the background script
const parser = new MoyParser(parserOptions)

function checkUrl() {
    if (oldUrl != window.location.href) {
        oldUrl = window.location.href
        setTimeout(moy, 50, true)
    }
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

function moy(fullUrlChanged) {
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
        pageMoyed = true
    } else if (fullUrlChanged && pageMoyed) {
        // by now, we've smashed the dynamic page, so need to reload it
        pageMoyed = false
        window.location.reload()
    }
}

moy(false)
setInterval(checkUrl, 1000)

// needed so that the script's result is 'structured clonable data'
undefined
