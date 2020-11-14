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

/* global Handlebars, module */

'use strict'

function ensureString(v, msg) {
    if ('string' !== typeof v) {
        throw new Error(msg)
    }
}

function checkAndUnifyAuthor(author) {
    if ('string' === typeof author) {
        return {name: author}
    } else if ('object' === typeof author) {
        ensureString(author.name, 'Template author name must present and be a string')
        return author
    } else if ('undefined' === typeof author) {
        return {name: 'Unknown author'}
    } else {
        throw new Error('Template author must be a string or an object')
    }
}

function checkAndUnifyTemplateInfo(info) {
    const types = ['article', 'feed', 'custom']
    const {name, type, customType, author, description} = info    
    ensureString(name, 'Template name must present and be a string')
    ensureString(type, 'Template type must present and be a string')
    if (0 > types.indexOf(type)) {
        throw new Error('Template type must be one of these: ' + types.join(', '))
    }
    if ('custom' === type) {
        ensureString(customType, 'If template type is custom, customType must present and be a string')
        if (0 <= types.indexOf(customType)) {
            throw new Error('Template customType must NOT be one of these: ' + types.join(', '))
        }
    }
    info.author = checkAndUnifyAuthor(author)
    if (description) {
        ensureString(description, 'Template description must be a string')
    } else {
        info.description = ''
    }    
    return info
}

function extractHeaderComment(templateDoc, commentStart, commentEnd) {
    if (templateDoc.startsWith(commentStart)) {
        let lastIndex = templateDoc.indexOf(commentEnd)
        if (-1 < lastIndex) {
            return templateDoc.substring(commentStart.length, lastIndex).trim()
        }
    }
}

function parseTemplateInfo(templateDoc, parseYaml) {
    templateDoc = templateDoc.trim()
    let infoText = extractHeaderComment(templateDoc, '{{!--', '--}}')
    if (!infoText) {
        infoText = extractHeaderComment(templateDoc, '{{!', '}}')
    }
    if (!infoText) {
        throw new Error('Template information section is missing')
    }
    return checkAndUnifyTemplateInfo(parseYaml(infoText))
}

function MoyTemplate(options) {
    const {content: templateDoc, parseYaml} = options
    this.options = options
    this.info = parseTemplateInfo(templateDoc, parseYaml)
    this.name = this.info.name
    this.text = templateDoc
}

MoyTemplate.create = function(options, cb) {
    try {
        cb(undefined, new MoyTemplate(options))
    } catch (e) {
        cb(e)
    }
}

if (typeof module !== 'undefined' && module.exports) {
    module.exports = MoyTemplate
}
