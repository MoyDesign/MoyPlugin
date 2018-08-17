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
This software also includes parts of the Handlebars library. Its license is here:
https://github.com/wycats/handlebars.js/blob/master/LICENSE
*/

'use strict'

const SECOND = 1000
const MINUTE = 60 * SECOND
const HOUR = 60 * MINUTE

const MOY_TRY_URL_PREFIX = 'https://moy.design/try'
const PARSERS_DIR = 'MoyParsers'
const TEMPLATES_DIR = 'MoyTemplates'
const MEDIA_DOMAINS = ['youtube.com', 'youtu.be', 'ytimg.com', 'googlevideo.com', 'vimeo.com', 'vimeocdn.com', 
    'lj-toys.com', '9cache.com']
const ORIGINAL_LOOK_NAME = 'Original look'
const PAGE_ACTION_URL_PROTOCOLS = ['http:', 'https:']
const PAGE_ACTION_BANNED_URLS = ['https://addons.mozilla.org', 'https://chrome.google.com/webstore']

const AUX_CONTENT_SCRIPTS = ['/lib/handlebars.min.js', '/lib/jquery.slim.min.js', '/src/moyparser.js']
const MAIN_CONTENT_SCRIPT = '/src/cs.js'
const POLYFILL_CONTENT_SCRIPT = '/lib/browser-polyfill.min.js'
const FRAME_INJECTOR_SCRIPT = '/src/frame-injector.js'
const WELCOME_PAGE = '/src/welcome.html'

const REFRESH_INTERVAL = 5 * HOUR
const CHECK_INTERVAL = 5 * MINUTE

const DEFAULT_SETTINGS = {
    githubUser: 'MoyDesign'
}

let settings = {
    typeTemplates: new Map(),
    parserTemplates: new Map(),
    githubUser: DEFAULT_SETTINGS.githubUser
}

let state = {
    parsers: new Map(),
    templates: new Map(),
    lastRefresh: 0,
    refreshDataPromise: null,

    tabBindings: new Map()
}

async function saveSettings() {
    await browser.storage.local.set({
        typeTemplates: [...settings.typeTemplates],
        parserTemplates: [...settings.parserTemplates],
        githubUser: settings.githubUser || DEFAULT_SETTINGS.githubUser
    })
}

async function loadSettings() {
    const tmp = await browser.storage.local.get()
    if (tmp) {
        settings.typeTemplates = new Map(tmp.typeTemplates || [])
        settings.parserTemplates = new Map(tmp.parserTemplates || [])
        settings.githubUser = tmp.githubUser || DEFAULT_SETTINGS.githubUser
    }
}

async function fetchFile(githubFileInfo) {
    const resp = await fetch(githubFileInfo.download_url)
    if (!resp.ok) {
        throw new Error(`${resp.statusText}: ${githubFileInfo.download_url}`)
    }
    return await resp.text()
}

function githubDirUrl(dirname) {
    const user = settings.githubUser || DEFAULT_SETTINGS.githubUser
    return `https://api.github.com/repos/${user}/MoyData/contents/${dirname}`
}

async function fetchDir(dirname) {
    const url = githubDirUrl(dirname)
    const resp = await fetch(url)
    if (!resp.ok) {
        throw new Error(`${resp.statusText}: ${url}`)
    }
    return await resp.json()
}

async function fetchParser(githubFileInfo) {
    const text = await fetchFile(githubFileInfo)
    return new MoyParser({content: jsyaml.safeLoad(text)})
}

async function fetchTemplate(githubFileInfo) {
    const text = await fetchFile(githubFileInfo)
    return new MoyTemplate({content: text, parseYaml: jsyaml.safeLoad})
}

async function fetchMap(dirname, fileFetcher, entityFilter) {
    const dir = await fetchDir(dirname)
    let entities = await Promise.all(dir.map(fileFetcher))
    if (entityFilter) {
        entities = entities.filter(entityFilter)
    }
    return new Map(entities.map(e => [e.name, e]))
}

function templateFilter(template) {
    return ORIGINAL_LOOK_NAME !== template.name.trim()
}

async function refreshData() {
    if (!state.refreshDataPromise) {
        state.refreshDataPromise = Promise.all([
                fetchMap(PARSERS_DIR, fetchParser),
                fetchMap(TEMPLATES_DIR, fetchTemplate, templateFilter)
            ])
            .then(res => {
                state.parsers = res[0]
                state.templates = res[1]
                showWelcomePage()
            })
            .catch(e => {
                console.log('Failed to refresh data', e)
                throw e
            })
            .finally(() => {
                state.lastRefresh = Date.now()
                state.refreshDataPromise = null
            })
    }
    return state.refreshDataPromise
}

function stopDataRefreshing(reason) {
    if (state.refreshDataPromise) {
        Promise.reject(state.refreshDataPromise)
    }
}

function periodicDataRefresh() {
    if (REFRESH_INTERVAL < Date.now() - state.lastRefresh) {
        refreshData()
    }
    setTimeout(periodicDataRefresh, CHECK_INTERVAL)
}

function findValue(aMap, predicate) {
    for (const v of aMap.values()) {
        if (predicate(v)) {
            return v
        }
    }
}

function findParser(url) {
    return url && findValue(state.parsers, p => p.isMatch(url))
}

function findTemplate(parser) {
    if (parser) {
        let name = settings.parserTemplates.get(parser.name)
        if (!name) {
            name = settings.typeTemplates.get(parser.info.type)
        }
        if (name) {
            return ORIGINAL_LOOK_NAME !== name ? state.templates.get(name) : undefined
        } else {
            return findValue(state.templates, t => t.info.type === parser.info.type)
        }
    }
}

function registerTabBinding(tabId, url) {
    const parser = findParser(url)
    const template = findTemplate(parser)
    if (parser && template) {
        const binding = {parser: parser, template: template}
        state.tabBindings.set(tabId, binding)
        return binding
    } else {
        state.tabBindings.delete(tabId)
    }
}

function isMedia(url) {
    if (url) {
        const hostname = new URL(url).hostname
        return MEDIA_DOMAINS.find(d => hostname.endsWith(d))
    }
}

function createCancelResponse(type) {
    // Here we need an intelligent ban response instead of just returning {cancel: true}.
    // This is because some pages doesn't work with cancelled requests. 
    // For example, any article on Aftershock (e.g. https://aftershock.news/?q=node/659962).
    // There, if some of the sub-requests are cancelled, loaded DOM gets destroyed
    // (or something like that, but the parser doesn't work).
    let mime = ''
    if ('stylesheet' == type) {
        mime = 'text/css'
    }
    if ('script' == type) {
        mime = 'application/javascript'
    }
    return {redirectUrl: 'data:' + mime + ','}
}

function quotedString(str) {
    // this function is taken from Handlebars
    return '"' + (str + '')
        .replace(/\\/g, '\\\\')
        .replace(/"/g, '\\"')
        .replace(/\n/g, '\\n')
        .replace(/\r/g, '\\r')
        .replace(/\u2028/g, '\\u2028') // Per Ecma-262 7.3 + 7.8.4
        .replace(/\u2029/g, '\\u2029') + '"'
}

async function executeRenderingScripts(tabId, binding) {
    await Promise.all(AUX_CONTENT_SCRIPTS.map(
        file => browser.tabs.executeScript(tabId, {file: file})))
    await browser.tabs.executeScript(tabId, {
        code: 
            'const compiledTemplateSpec = eval(' + binding.template.precompiled + ')\n' +
            'const parserOptions = JSON.parse(' + quotedString(JSON.stringify(binding.parser.options)) + ')\n'
    })
    await browser.tabs.executeScript(tabId, {file: MAIN_CONTENT_SCRIPT})
}

function onBeforeRequest(request) {
    const {url, tabId, type, method} = request
    if (-1 != tabId && url) {
        if ('GET' === method && 'main_frame' === type && !url.startsWith(MOY_TRY_URL_PREFIX)) {
            const binding = registerTabBinding(tabId, url)
            if (binding) {
                const redirectUrl = binding.parser.getRedirectUrl(url)
                if (redirectUrl) {
                    return {redirectUrl: redirectUrl}
                }
            }
        } else if ('image' !== type && 'imageset' !== type && state.tabBindings.has(tabId) && !isMedia(url)) {
            return createCancelResponse(type)
        }
    }
}

function onDOMContentLoaded(details) {
    const {url, tabId, frameId} = details
    if (-1 != tabId && 0 == frameId && url && !url.startsWith(MOY_TRY_URL_PREFIX)) {
        const binding = state.tabBindings.get(tabId)
        if (binding) {
            executeRenderingScripts(tabId, binding)
                    .catch(e => console.log('Failed to execute rendering content scripts', e))
        }
    }
}

function switchPageAction(tabId, url) {
    if (0 > tabId && !url) {
        return
    }
    const isProtocolOk = PAGE_ACTION_URL_PROTOCOLS.includes(new URL(url).protocol)
    const isUrlBanned = PAGE_ACTION_BANNED_URLS.find(u => url.startsWith(u))
    if (isProtocolOk && !isUrlBanned) {
        browser.pageAction.show(tabId)
    } else {
        browser.pageAction.hide(tabId)
    }
}

function onTabUpdated(tabId, changeInfo) {
    if (changeInfo.url) {
        switchPageAction(tabId, changeInfo.url)
    }
}

function onTabRemoved(tabId, removeInfo) {
    state.tabBindings.delete(tabId)
}

function onTabReplaced(addedTabId, removedTabId) {
    const removedTabBanOptions = state.tabBindings.get(removedTabId)
    if (removedTabBanOptions) {
        state.tabBindings.set(addedTabId, removedTabBanOptions)
    }
    onTabRemoved(removedTabId, null)
}

async function initTabs() {
    const tabs = await browser.tabs.query({})
    tabs.forEach(tab => switchPageAction(tab.id, tab.url))
}

async function injectFrame(tab) {
    await browser.tabs.executeScript(tab.id, {file: POLYFILL_CONTENT_SCRIPT})
    await browser.tabs.executeScript(tab.id, {file: FRAME_INJECTOR_SCRIPT})
}

async function removeFrame(tab) {
    await browser.tabs.sendMessage(tab.id, {type: 'unload'})
}

async function checkFrame(tab) {
    const isFrame = await browser.tabs.sendMessage(tab.id, {type: 'check'})
    if (!isFrame) {
        throw new Error('No frame')
    }
}

function onIconClicked(tab) {
    if (-1 == tab.id) {
        return
    }
    checkFrame(tab)
        .then(() => removeFrame(tab).catch(e => console.log('Failed to remove frame', e)))
        .catch(() => injectFrame(tab))
        .catch(e => console.log('Failed to inject frame', e))
}

function promise(ret) {
    return new Promise(resolve => resolve(ret))
}

function bindingInfo(binding) {
    if (binding) {
        const {parser, template} = binding
        return {
            parserName: parser.name,
            templateName: template.name
        }
    }
}

function otherLooks(type, name) {
    return Array.from(state.templates.values())
        .filter(t => t.info.type === type && t.name !== name)
        .map(t => t.name)
}

async function switchLook(tab, templateName) {
    if (ORIGINAL_LOOK_NAME === templateName) {
        const binding = state.tabBindings.get(tab.id)
        if (binding) {
            // we set the original look for each parser separately
            settings.parserTemplates.set(binding.parser.name, ORIGINAL_LOOK_NAME)
        } else {
            throw new Error('Binding not found')
        }
    } else {
        const template = state.templates.get(templateName)
        if (template) {
            // we set a custom look for the whole type at once
            settings.typeTemplates.set(template.info.type, templateName)
            const parser = findParser(tab.url)
            if (parser) {
                settings.parserTemplates.delete(parser.name)
            }
        } else {
            throw new Error('Template not found: ' + templateName)
        }
    }
    await saveSettings()
    await browser.tabs.reload(tab.id)
}

function getTabInfo(tab) {
    const binding = state.tabBindings.get(tab.id)
    let looks = undefined
    if (binding) {
        const {type, name} = binding.template.info
        looks = otherLooks(type, name)
    } else {
        const parser = findParser(tab.url)
        if (parser) {
            looks = otherLooks(parser.info.type, ORIGINAL_LOOK_NAME)
        }
    }
    return {
        binding: bindingInfo(binding),
        otherLooks: looks,
        originalLookName: ORIGINAL_LOOK_NAME
    }
}

async function setSettings(newSettings) {
    const {githubUser} = newSettings
    if (githubUser && githubUser !== settings.githubUser) {
        stopDataRefreshing()
        settings.githubUser = githubUser
        try {
            await refreshData()
        } catch(e) {
            await loadSettings()
            throw e;
        }
        await saveSettings()
    } else {
        return promise({})
    }
}

function showWelcomePage() {
    browser.tabs.create({url: WELCOME_PAGE}).catch(e => console.log('Failed to show Welcome page', e))
}

function getTestPages() {
    return {
        testPages: Array.from(state.parsers.values()).filter(p => 0 < p.info.testPages.length).map(p => ({
            name: p.name,
            urls: p.info.testPages
        }))
    }
}

function onMessage(msg, sender) {
    if ('info' === msg.type) {
        return promise(getTabInfo(sender.tab))

    } else if ('unload' === msg.type) {
        return removeFrame(sender.tab)

    } else if ('switch_look' === msg.type) {
        return switchLook(sender.tab, msg.name)

    } else if ('get_settings' === msg.type) {
        return promise({settings: settings, defaultSettings: DEFAULT_SETTINGS})

    } else if ('set_settings' === msg.type) {
        return setSettings(msg.settings)

    } else if ('show_welcome_page' === msg.type) {
        showWelcomePage()
        return promise({})

    } else if ('get_test_pages' === msg.type) {
        return promise(getTestPages())
    }
}

loadSettings()
    .catch(e => console.log('Failed to load settings', e))
    .finally(() => {
        refreshData()
        periodicDataRefresh()
    })

browser.webRequest.onBeforeRequest.addListener(onBeforeRequest, {urls: ['*://*/*']}, ['blocking'])
browser.webNavigation.onDOMContentLoaded.addListener(onDOMContentLoaded, {url: [{urlMatches: '.*'}]})
browser.pageAction.onClicked.addListener(onIconClicked)
browser.runtime.onMessage.addListener(onMessage)

browser.tabs.onRemoved.addListener(onTabRemoved)
browser.tabs.onReplaced.addListener(onTabReplaced)
browser.tabs.onUpdated.addListener(onTabUpdated)

initTabs().catch(e => console.log('Failed to init tabs', e))
