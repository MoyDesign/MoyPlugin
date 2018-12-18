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

/*
This software also includes parts of the Lodash library. Its license is here:
https://github.com/lodash/lodash/blob/master/LICENSE
*/

/* global jQuery, module */

'use strict'

const REGEXP_CHAR = /[\\^$.*+?()[\]{}|]/g
const HAS_REGEXP_CHAR = new RegExp(REGEXP_CHAR.source)

const STYLING_ATTRIBUTES = ['align', 'bgcolor', 'border', 'class', 'color', 'dir', 'height', 'style', 'width']

const BASIC_TAGS = ['h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'p', 'blockquote', 'br', 'i', 'em', 'b', 'strong', 
    'ul', 'ol', 'li', 'dl', 'dt', 'dd', 'hr', 'code', 'del', 'pre', 's', 'u', 'small', 'sub', 'sup', 'img', 
    'audio', 'video', 'source', 'a', 'table', 'th', 'tr', 'td', 'thead', 'tbody', 'tfoot', 'div', 'span', 'iframe',
    'article', 'details', 'figcaption', 'figure', 'footer', 'header', 'main', 'mark', 'section', 'summary', 
    'time', 'wbr', 'font', 'center', 'cite']

const EXTENDED_TAG_SELECTOR = BASIC_TAGS.reduce(function(ret, t) {
        return ret + ':not(' + t + ')'
    }, '')

const DEFAULT_RULES = [
    {
        name: 'TITLE',
        match: 'title'
    },

    {
        name: 'OPEN_GRAPH_TAGS',
        match: {
            include: 'meta[property^="og:"]',
            outerNode: true
        }
    },

    {
        name: 'ICON_TAGS',
        match: {
            or: [
                { include: 'link[rel="icon"]', outerNode: true },
                { include: 'link[rel="shortcut icon"]', outerNode: true }
            ]
        }
    }
]
checkRulesArray(DEFAULT_RULES)

function ensurePresent(v, msg) {
    if (!v) {
        throw new Error(msg)
    }
}

function ensurePresentOneOf(arr, msg) {
    for (const v of arr) {
        if (v) {
            return
        }
    }
    throw new Error(msg)
}

function ensureString(v, msg) {
    if ('string' != typeof v) {
        throw new Error(msg)
    }
}

function ensureRegex(v, msg) {
    try {
        new RegExp(v)
    } catch (e) {
        throw new Error(msg)
    }
}

function prepareArrayOfStrings(a, msg) {
    if (a) {
        if ('string' == typeof a) {
            return [a]
        } else if (Array.isArray(a)) {
            a.forEach(function(s) {
                ensureString(s, msg)
            })
            return a
        } else {
            throw new Error(msg)
        }
    } else {
        return []
    }
}

function parseBool(v, msg) {
    if (undefined == v) {
        return false
    }
    if ('string' == typeof v) {
        if ('true' != v && 'false' != v) {
            throw new Error(msg)
        }
        return 'true' == v
    } else if ('number' == typeof v) {
        if (1 != v & 0 != v) {
            throw new Error(msg)
        }
        return 1 == v
    } else if ('boolean' != typeof v) {
        throw new Error(msg)
    }
    return v
}

function ensureArray(v, msg) {
    if (!Array.isArray(v)) {
        throw new Error(msg)
    }
}

function removeStyles(jQuery, rawEl) {
    const el = jQuery(rawEl)
    STYLING_ATTRIBUTES.forEach(name => el.removeAttr(name))
    el.children().each(function() {
        removeStyles(jQuery, this)
    })
    return el
}

function checkAndUnifyMatchBlock(m, hasSubRules) {
    if ('string' == typeof m) {
        return {
            include: m,
            exclude: '',
            outerNode: false,
            removeInside: [],
            keepBasicMarkup: hasSubRules
        }
    } else {
        ensurePresent(m.include, 'Rule match must have include')
        ensureString(m.include, 'Rule match include must be a string')
        if (m.exclude) {
            ensureString(m.exclude, 'Rule match exclude must be a string')
        } else {
            m.exclude = ''
        }
        if (m.addNextUntil) {
            ensureString(m.addNextUntil, 'Rule match addNextUntil must be a string (if present)')
            m.outerNode = false
        } else {
            m.outerNode = parseBool(m.outerNode, 'Allowed values for match.outerNode are true/false/1/0, but got ' + m.outerNode)
        }
        m.removeInside = prepareArrayOfStrings(m.removeInside, 'removeInside must be either a string or array of strings')
        if (m.attribute) {
            ensureString(m.attribute, 'Rule match attribute must be a string')
        }
        if (m.outerNode || hasSubRules) {
            m.keepBasicMarkup = true
        } else {
            m.keepBasicMarkup = parseBool(m.keepBasicMarkup, 'Allowed values for match.keepBasicMarkup are true/false/1/0, but got ' + m.keepBasicMarkup)
        }
        return m
    }
}

function checkAndUnifyRewriteBlock(rw, hasSubRules) {
    if (hasSubRules) {
        throw new Error('Rule with subrules can not contain rewrite block')
    }
    if ('string' == typeof rw) {
        return {
            output: rw,
            find: '.*'
        }
    } else {
        ensurePresent(rw.output, 'Rule rewrite must have output')
        ensureString(rw.output, 'Rule rewrite output must be a string')
        if (rw.find) {
            try {
                new RegExp(rw.find)
            } catch (e) {
                throw new Error('Rule rewrite find must be a valid RegExp string')
            }
        }
        return rw
    }
}

function checkAndUnifyRule(rule) {
    ensurePresent(rule, 'No rule')
    ensurePresent(rule.name, 'Rule must have a name')
    ensureString(rule.name, 'Rule name must be a string')
    ensurePresentOneOf([rule.match, rule.attribute, rule['value']],
        'Rule match, rule attribute or rule value must be present')
    if (rule.match) {
        var hasSubRules = false
        if (rule.rules) {
            checkRulesArray(rule.rules)
            hasSubRules = true
        }
        var m = rule.match
        if ('string' == typeof m) {
            rule.match = checkAndUnifyMatchBlock(m, hasSubRules)
        } else if ('object' == typeof m) {
            if (m.or) {
                if (!Array.isArray(m.or)) {
                    throw new Error('OR block must contain an array')
                }
                m.or.forEach(function(matchBlock, key) {
                    m.or[key] = checkAndUnifyMatchBlock(matchBlock, hasSubRules)
                })
            } else {
                checkAndUnifyMatchBlock(m, hasSubRules)
            }
        } else {
            throw new Error('Rule match must be either a string or an object')
        }
    } else if (rule.attribute) {
        ensureString(rule.attribute, 'Rule attribute must be a string')
    } else { // rule.value
        rule['value'] = prepareArrayOfStrings(rule['value'], 'Rule value must be a string or array of strings')
    }
    if (rule.rewrite) {
        rule.rewrite = checkAndUnifyRewriteBlock(rule.rewrite, hasSubRules)
    }
}

function checkRulesArray(rules) {
    ensureArray(rules, 'Rules must be an array')
    rules.forEach(checkAndUnifyRule)
}

function checkRedirect(redirect) {
    ensurePresent(redirect.query, 'No query in redirect')
    const sp = redirect.query.setParams
    ensurePresent(sp, 'No setParams in redirect query')
    if ('object' != typeof sp) {
        throw new Error('setParams must be an object')
    }
}

function checkAndUnifyAuthor(author) {
    if ('string' === typeof author) {
        return {name: author}
    } else if ('object' === typeof author) {
        ensureString(author.name, 'Parser author name must present and be a string')
        return author
    } else if ('undefined' === typeof author) {
        return {name: 'Unknown author'}
    } else {
        throw new Error('Parser author must be a string or an object')
    }
}

function escapeRegExp(s) {
    // this function is taken from Lodash sources
    return HAS_REGEXP_CHAR.test(s) ? s.replace(REGEXP_CHAR, '\\$&') : s
}

function getSuggestedRegex(domain, path) {
    var ret = escapeRegExp(domain)
    if (!ret.endsWith('/') && !path.startsWith('/')) {
        ret += '/'
    }
    ret += path
    ret = '^https?://[^/]*' + ret
    if (-1 >= path.indexOf('\\?')) {
        ret += '(\\?.*)?'
    }
    if (-1 >= path.indexOf('#')) {
        ret += '(#.*)?'
    }
    if (!ret.endsWith('$')) {
        ret += '$'
    }
    return ret
}

function checkAndUnifyInfo(info) {
    const types = ['article', 'feed', 'custom']
    const {name, type, domain, path, customType, testPages, author, suggestedRegex, description} = info
    ensureString(name, 'Parser name must present and be a string')
    ensureString(type, 'Parser type must present and be a string')
    if (0 > types.indexOf(type)) {
        throw new Error('Parser type must be one of these: ' + types.join(', '))
    }
    if ('custom' === type) {
        ensureString(customType, 'If parser type is custom, customType must present and be a string')
        if (0 <= types.indexOf(customType)) {
            throw new Error('Parser customType must NOT be one of these: ' + types.join(', '))
        }
    }
    ensureString(domain, 'Parser domain must present and be a string')
    ensurePresentOneOf([path, suggestedRegex], 'Parser path or suggestedRegex must present')
    if (path) {
        ensureRegex(path, 'Parser path must be a valid regex')
    }
    if (suggestedRegex) {
        ensureRegex(suggestedRegex, 'Parser suggestedRegex must be a valid regex')
    } else {
        info.suggestedRegex = getSuggestedRegex(domain, path)
    }
    info.testPages = prepareArrayOfStrings(testPages, 'Parser testPages must be a string or array of strings')
    const matcher = new RegExp(info.suggestedRegex)
    info.testPages.forEach(url => {
        if (!matcher.test(url)) {
            throw new Error(`Test page doesn't match for parser '${name}': ${url}`)
        }
    })
    info.author = checkAndUnifyAuthor(author)
    if (description) {
        ensureString(description, 'Parser description must be a string')
    } else {
        info.description = ''
    }
}

function checkParserDoc(parserDoc) {
    ensurePresent(parserDoc, 'No parser')
    ensurePresent(parserDoc.rules, 'No rules in parser doc ' + parserDoc)
    checkAndUnifyInfo(parserDoc.info)
    checkRulesArray(parserDoc.rules)
    if (parserDoc.redirect) {
        checkRedirect(parserDoc.redirect)
    }
}

function parseWithMatchBlock(jQuery, contextElem, matchBlock, hasSubRules) {
    var nodes = jQuery(matchBlock.include, contextElem)
    if ('' != matchBlock.exclude) {
        nodes = nodes.not(matchBlock.exclude)
    }
    if (matchBlock.addNextUntil) {
        nodes = nodes.map(function() {
            return jQuery("<div></div>").append(jQuery(this).nextUntil(matchBlock.addNextUntil).addBack())
        })
    }
    matchBlock.removeInside.forEach(function(selector) {
        nodes.find(selector).remove()
    })
    if (hasSubRules) {
        // skip the rest for a rule with sub-rules
        return nodes.get()
    }
    nodes.find(EXTENDED_TAG_SELECTOR).remove()
    var outerNode = matchBlock.outerNode
    var attribute = matchBlock.attribute
    var keepBasicMarkup = matchBlock.keepBasicMarkup
    return nodes.map(function() {
        if (attribute) {
            return jQuery(this).attr(attribute)
        } else if (keepBasicMarkup) {
            var ret = removeStyles(jQuery, this)
            return outerNode ? ret[0].outerHTML : ret.html()
        } else {
            return jQuery(this).text()
        }
    }).get()
}

function stripHtml(jQuery, str) {
    return jQuery('<div/>').html(str).text()
}

function parseWithRule(jQuery, contextElem, rule) {
    const hasSubRules = rule.rules
    const match = rule.match
    const attribute = rule.attribute
    let ret = []
    if (!match) {
        if (rule.attribute) {
            ret.push(jQuery(contextElem).attr(attribute) || '')
        } else {
            ret = ret.concat(stripHtml(jQuery, rule['value']))
        }
    } else {
        // match block
        if (match.or) {
            match.or.find(function(matchBlock) {
                ret = parseWithMatchBlock(jQuery, contextElem, matchBlock, hasSubRules)
                return ret.length != 0
            })
        } else {
            ret = parseWithMatchBlock(jQuery, contextElem, match, hasSubRules)
        }
        if (rule.rules) {
            ret = ret.map(function(elem) {
                var mapped = {}
                var children = parseWithRules(jQuery, elem, rule.rules).content
                children.forEach(function(cv, ck) {
                    mapped[ck] = cv
                })
                return mapped
            })
        }
    }
    if (rule.rewrite) {
        ret = ret.map(function(elem) {
            const result = new RegExp(rule.rewrite.find).exec(elem)
            if (result) {
                elem = rule.rewrite.output.replace(/\$(\d+)/g, (m, p1) => {
                    const i = parseInt(p1, 10)
                    return isNaN(i) ? '' : (result[i] || '')
                })
                elem = stripHtml(jQuery, elem)
            }
            return elem
        })
    }
    return ret
}

function parseWithRules(jQuery, contextElem, rules) {
    var ret = new Map()
    rules.forEach(function(rule) {
        ret.set(rule.name, parseWithRule(jQuery, contextElem, rule))
    })
    return {content: ret}
}

function MoyParser(options) {
    var parserDoc = options.content
    checkParserDoc(parserDoc)
    DEFAULT_RULES.forEach(function(defRule) {
        if (!parserDoc.rules.find(function(r) { return r.name == defRule.name })) {
            parserDoc.rules.push(defRule)
        }
    })
    this.rules = parserDoc.rules
    this.id = options.id
    this.name = parserDoc.info.name
    this.matchRegex = new RegExp(parserDoc.info.suggestedRegex)
    this.info = parserDoc.info
    this.options = options
    this.jQuery = options.jQuery || jQuery
    this.URL = options.URL || URL
    this.document = options.document || document
    this.redirect = parserDoc.redirect
}

MoyParser.checkParserDoc = function(parserDoc) {
    checkParserDoc(parserDoc)
}

MoyParser.create = function(options, cb) {
    try {
        cb(undefined, new MoyParser(options))
    } catch (e) {
        cb(e)
    }
}

MoyParser.prototype.getRedirectUrl = function(url) {
    const parserDoc = this.options.content
    if (parserDoc.redirect) {
        const parsedUrl = new this.URL(url)
        const sp = parsedUrl.searchParams
        let changed = false
        for (const [param, val] of Object.entries(parserDoc.redirect.query.setParams)) {
            if (sp.get(param) != val) {
                sp.set(param, val)
                changed = true
            }
        }
        return changed ? parsedUrl.toString() : undefined
    }
}

MoyParser.prototype.isMatch = function(url) {
    return this.matchRegex.test(url)
}

MoyParser.prototype.parse = function(cb) {
    if (cb) {
        try {
            cb(undefined, parseWithRules(this.jQuery, this.document, this.rules))
        } catch (e) {
            cb(e)
        }
    } else {
        return parseWithRules(this.jQuery, this.document, this.rules)
    }
}

if (typeof module !== 'undefined' && module.exports) {
    module.exports = MoyParser
}

// needed so that the script's result is 'structured clonable data'
undefined
