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
