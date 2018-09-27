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

/* global MoyParser, MoyTemplate, jsyaml */

'use strict'

const SECOND = 1000
const MINUTE = 60 * SECOND
const HOUR = 60 * MINUTE

const PARSERS_DIR = 'MoyParsers'
const TEMPLATES_DIR = 'MoyTemplates'
const MEDIA_DOMAINS = ['youtube.com', 'youtu.be', 'ytimg.com', 'googlevideo.com', 'vimeo.com', 'vimeocdn.com', 
    'lj-toys.com', '9cache.com']
const ORIGINAL_LOOK_NAME = 'Original look'
const PAGE_ACTION_URL_PROTOCOLS = ['http:', 'https:']
const PAGE_ACTION_BANNED_URLS = ['https://addons.mozilla.org', 'https://chrome.google.com/webstore']

const AUX_CONTENT_SCRIPTS = ['/lib/handlebars.min.js', '/lib/jquery.slim.min.js', '/src/moyparser.js']
const MAIN_CONTENT_SCRIPTS = ['/src/cs.js']
const POLYFILL_CONTENT_SCRIPT = '/lib/browser-polyfill.min.js'
const FRAME_INJECTOR_SCRIPT = '/src/frame-injector.js'
const WELCOME_PAGE = '/src/welcome.html'

const REFRESH_INTERVAL = 5 * HOUR
const CHECK_INTERVAL = 5 * MINUTE

const DEFAULT_SETTINGS = {
    githubUser: 'MoyDesign'
}

let settings = {
    parsers: new Map(),
    templates: new Map(),
    typeTemplates: new Map(),
    parserTemplates: new Map(),
    githubUser: DEFAULT_SETTINGS.githubUser,
    welcomePageShown: false
}

let state = {
    parsers: new Map(),
    templates: new Map(),
    lastRefresh: 0,
    refreshDataPromise: null,
    lastRefreshError: null,

    tabBindings: new Map()
}

function createParser(options) {
    const {text, link} = options
    return new MoyParser({content: jsyaml.safeLoad(text), text: text, link: link})
}

function createTemplate(options) {
    const {text, link} = options
    return new MoyTemplate({content: text, parseYaml: jsyaml.safeLoad, text: text, link: link})
}

async function saveSettings() {
    await browser.storage.local.set({
        parsers: Array.from(settings.parsers.values).map(p => p.options.text),
        templates: Array.from(settings.templates.values).map(t => t.options.text),
        typeTemplates: [...settings.typeTemplates],
        parserTemplates: [...settings.parserTemplates],
        githubUser: settings.githubUser || DEFAULT_SETTINGS.githubUser,
        welcomePageShown: settings.welcomePageShown || false
    })
}

async function loadSettings() {
    const tmp = await browser.storage.local.get()
    if (tmp) {
        function mapTextArray(arr, mapperFunc) {
            return new Map((arr || []).map(text => {
                try {
                    const p = mapperFunc({text: text, link: ''})
                    return [p.name, p]
                } catch (e) {
                    console.log('Settings loading failure', e)
                    return undefined
                }
            }).filter(Boolean))
        }
        settings.parsers = mapTextArray(tmp.parsers, createParser)
        settings.templates = mapTextArray(tmp.templates, createTemplate)
        settings.typeTemplates = new Map(tmp.typeTemplates || [])
        settings.parserTemplates = new Map(tmp.parserTemplates || [])
        settings.githubUser = tmp.githubUser || DEFAULT_SETTINGS.githubUser,
        settings.welcomePageShown = tmp.welcomePageShown || false
    }
}

async function fetchFile(githubFileInfo) {
    const resp = await fetch(githubFileInfo.download_url)
    if (!resp.ok) {
        throw new Error(`${resp.statusText}: ${githubFileInfo.download_url}`)
    }
    return {
        link: githubFileInfo.html_url,
        text: await resp.text()
    }
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
    return createParser(await fetchFile(githubFileInfo))
}

async function fetchTemplate(githubFileInfo) {
    return createTemplate(await fetchFile(githubFileInfo))
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
                state.lastRefreshError = null
            })
            .catch(e => {
                console.log('Failed to refresh data', e)
                state.lastRefreshError = e
                throw e
            })
            .finally(() => {
                state.lastRefresh = Date.now()
                state.refreshDataPromise = null
                if (!settings.welcomePageShown) {
                    showWelcomePage()
                }
            })
    }
    return state.refreshDataPromise
}

function stopDataRefreshing() {
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

function findValue(mapArray, predicate) {
    for (const aMap of mapArray) {
        for (const v of aMap.values()) {
            if (predicate(v)) {
                return v
            }
        }
    }
}

function getValue(mapArray, key) {
    for (const aMap of mapArray) {
        const ret = aMap.get(key)
        if (ret) {
            return ret
        }
    }
}

function findParser(url) {
    return url && findValue([settings.parsers, state.parsers], p => p.isMatch(url))
}

function findTemplate(parser) {
    if (parser) {
        let name = settings.parserTemplates.get(parser.name)
        if (!name) {
            name = settings.typeTemplates.get(parser.info.type)
        }
        if (name) {
            return ORIGINAL_LOOK_NAME !== name ? getValue([settings.templates, state.templates], name) : undefined
        } else {
            return findValue([settings.templates, state.templates], t => t.info.type === parser.info.type)
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
    for (const script of MAIN_CONTENT_SCRIPTS) {
        await browser.tabs.executeScript(tabId, {file: script})
    }
}

function onBeforeRequest(request) {
    const {url, tabId, type, method} = request
    if (-1 != tabId && url) {
        if ('GET' === method && 'main_frame' === type) {
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
    if (-1 != tabId && 0 == frameId && url) {
        const binding = state.tabBindings.get(tabId)
        if (binding) {
            executeRenderingScripts(tabId, binding)
                    .catch(e => console.log('Failed to execute rendering content scripts', e))
        }
        switchPageAction(tabId, url)
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

function onTabRemoved(tabId) {
    state.tabBindings.delete(tabId)
}

function onTabReplaced(addedTabId, removedTabId) {
    const removedTabBanOptions = state.tabBindings.get(removedTabId)
    if (removedTabBanOptions) {
        state.tabBindings.set(addedTabId, removedTabBanOptions)
    }
    onTabRemoved(removedTabId)
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
            parserLink: parser.options.link,
            templateName: template.name,
            templateLink: template.options.link
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
    browser.tabs.create({url: WELCOME_PAGE})
        .then(() => {
            settings.welcomePageShown = true
            saveSettings()
        })
        .catch(e => console.log('Failed to show Welcome page', e))
}

function getTestPages() {
    return {
        error: '' + state.lastRefreshError,
        testPages: Array.from(state.parsers.values()).filter(p => 0 < p.info.testPages.length).map(p => ({
            name: p.name,
            urls: p.info.testPages
        }))
    }
}

function getSettings() {
    function mapEntity(aMap) {
        const ret = []
        for (const p of aMap.values()) {
            ret.push({name: p.name, link: p.options.link})
        }
        return ret.sort((p1, p2) => p1.name > p2.name)
    }
    return {
        settings: settings,
        defaultSettings: DEFAULT_SETTINGS,
        remoteParsers: mapEntity(state.parsers),
        remoteTemplates: mapEntity(state.templates),
        localParsers: mapEntity(settings.parsers),
        localTemplates: mapEntity(settings.templates)
    }
}

async function setLocalEntity(entity) {
    if (entity.parser) {
        const parser = createParser({text: entity.parser, link: ''})
        settings.parsers.set(parser.name, parser)
    } else if (entity.template) {
        const template = createTemplate({text: entity.template, link: ''})
        settings.templates.set(template.name, template)
    } else {
        throw new Error('Either parser or template must be set')
    }
    await saveSettings()
}

function getLocalEntity(entity) {
    const ret = {}
    if (entity.parser) {
        const p = settings.parsers.get(entity.parser)
        ret.text = p ? p.options.text : ''
    } else if (entity.template) {
        const t = settings.templates.get(entity.template)
        ret.text = t ? t.options.text : ''
    }
    return ret
}

async function deleteLocalEntity(entity) {
    if (entity.parser) {
        settings.parsers.delete(entity.parser)
    } else if (entity.template) {
        settings.templates.delete(entity.template)
    }
    await saveSettings()
}

function onMessage(msg, sender) {
    if ('info' === msg.type) {
        return promise(getTabInfo(sender.tab))

    } else if ('unload' === msg.type) {
        return removeFrame(sender.tab)

    } else if ('switch_look' === msg.type) {
        return switchLook(sender.tab, msg.name)

    } else if ('get_settings' === msg.type) {
        return promise(getSettings())

    } else if ('set_settings' === msg.type) {
        return setSettings(msg.settings)

    } else if ('set_local_entity' === msg.type) {
        return setLocalEntity(msg.entity)

    } else if ('get_local_entity' === msg.type) {
        return promise(getLocalEntity(msg.entity))

    } else if ('delete_local_entity' === msg.type) {
        return deleteLocalEntity(msg.entity)

    } else if ('show_welcome_page' === msg.type) {
        showWelcomePage()
        return promise({})

    } else if ('get_test_pages' === msg.type) {
        return promise(getTestPages())

    } else if ('refresh_data' === msg.type) {
        return refreshData()
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

initTabs().catch(e => console.log('Failed to init tabs', e))
