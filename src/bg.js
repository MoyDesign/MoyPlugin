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
const POST_RENDER_MEDIA_DOMAINS = MEDIA_DOMAINS.concat(['instagram.com'])
const ORIGINAL_LOOK_NAME = 'Original look'
const PAGE_ACTION_URL_PROTOCOLS = ['http:', 'https:']
const PAGE_ACTION_BANNED_URLS = ['https://addons.mozilla.org', 'https://chrome.google.com/webstore']
const INSTAGRAM_EMBED_JS = 'https://www.instagram.com/embed.js'
const INSTAGRAM_SELECTOR = 'blockquote.instagram-media'

const AUX_CONTENT_SCRIPTS = ['/lib/handlebars.min.js', '/lib/jquery.slim.min.js', '/src/moyparser.js']
const MAIN_CONTENT_SCRIPTS = ['/src/cs.js']
const POLYFILL_CONTENT_SCRIPT = '/lib/browser-polyfill.min.js'
const FRAME_INJECTOR_SCRIPT = '/src/frame-injector.js'
const WELCOME_PAGE = '/src/welcome.html'
const EDITOR_PAGE = '/src/editor.html'

const REFRESH_INTERVAL = 5 * HOUR
const CHECK_INTERVAL = 5 * MINUTE

const DEFAULT_SETTINGS = {
    githubUser: 'MoyDesign'
}

let settings = {
    parsers: new Map(),
    templates: new Map(),
    remoteParsers: new Map(),
    remoteTemplates: new Map(),
    typeTemplates: new Map(),
    parserTemplates: new Map(),
    templateZoom: new Map(),
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
    const {text, link, local} = options
    return new MoyParser({
        content: jsyaml.safeLoad(text),
        text: text,
        link: link,
        local: !!local,
        allowStylesSelector: INSTAGRAM_SELECTOR
    })
}

function createTemplate(options) {
    const {text, link, local} = options
    return new MoyTemplate({content: text, parseYaml: jsyaml.safeLoad, text: text, link: link, local: !!local})
}

async function saveSettings() {
    function mapToTextArray(m) {
        return Array.from(m.values()).map(p => ({text: p.options.text, link: p.options.link || ''}))
    }
    const newSettings = {
        parsers: mapToTextArray(settings.parsers),
        templates: mapToTextArray(settings.templates),
        remoteParsers: mapToTextArray(state.parsers),
        remoteTemplates: mapToTextArray(state.templates),
        typeTemplates: [...settings.typeTemplates],
        parserTemplates: [...settings.parserTemplates],
        templateZoom: [...settings.templateZoom],
        githubUser: settings.githubUser || DEFAULT_SETTINGS.githubUser,
        welcomePageShown: settings.welcomePageShown || false
    }
    await browser.storage.local.set(newSettings)
}

async function loadSettings() {
    function mapTextArray(arr, mapperFunc) {
        return new Map((arr || []).map(obj => {
            try {
                const p = mapperFunc(obj)
                return [p.name, p]
            } catch (e) {
                console.log('Settings loading failure', e)
                return undefined
            }
        }).filter(Boolean))
    }
    const tmp = await browser.storage.local.get()
    if (tmp) {
        settings.parsers = mapTextArray(tmp.parsers, createParser)
        settings.templates = mapTextArray(tmp.templates, createTemplate)
        if (0 == state.parsers.size) {
            state.parsers = mapTextArray(tmp.remoteParsers, createParser)
        }
        if (0 == state.templates.size) {
            state.templates = mapTextArray(tmp.remoteTemplates, createTemplate)
        }
        settings.typeTemplates = new Map(tmp.typeTemplates || [])
        settings.parserTemplates = new Map(tmp.parserTemplates || [])
        settings.templateZoom = new Map(tmp.templateZoom || [])
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

async function allPossible(promises) {
    return Promise.all(promises.map(p => p.catch(e => e)))
}

async function fetchMap(dirname, fileFetcher, entityFilter) {
    const dir = await fetchDir(dirname)
    let entities = await allPossible(dir.map(fileFetcher))
    let ok = entities.filter(e => !(e instanceof Error))
    let err = entities.filter(e => e instanceof Error)
    if (entityFilter) {
        ok = ok.filter(entityFilter)
    }
    return {ok: new Map(ok.map(e => [e.name, e])), error: err}
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
                state.parsers = res[0].ok
                state.templates = res[1].ok
                if (res[0].error.length > 0 || res[1].error.length > 0) {
                    throw new Error(res[0].error.map(e => e.message).join('\n') + '\n' + 
                        res[1].error.map(e => e.message).join('\n'))
                } else {
                    state.lastRefreshError = null
                }
            })
            .catch(e => {
                console.log('Error while refreshing data', e)
                state.lastRefreshError = e
                throw e
            })
            .finally(() => {
                state.lastRefresh = Date.now()
                state.refreshDataPromise = null
                if (settings.welcomePageShown) {
                    saveSettings()
                } else {
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

function isMedia(url, binding) {
    if (url) {
        const hostname = new URL(url).hostname
        const domains = binding && binding.renderingFinished ? POST_RENDER_MEDIA_DOMAINS : MEDIA_DOMAINS
        return domains.find(d => hostname.endsWith(d))
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
    await browser.tabs.executeScript(tabId, {file: POLYFILL_CONTENT_SCRIPT})
    for (const script of MAIN_CONTENT_SCRIPTS) {
        await browser.tabs.executeScript(tabId, {file: script})
    }
}

async function executeInstagramEmbedScript(tabId) {
    const {text} = await fetchFile({download_url: INSTAGRAM_EMBED_JS})
    await browser.tabs.executeScript(tabId, {code: text})
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
            return
        }
        const binding = state.tabBindings.get(tabId)
        if ('image' !== type && 'imageset' !== type && binding && !isMedia(url, binding)) {
            return createCancelResponse(type)
        }
    }
}

function onDOMContentLoaded(details) {
    const {url, tabId, frameId} = details
    if (-1 != tabId && 0 == frameId && url) {
        const binding = state.tabBindings.get(tabId)
        if (binding) {
            const templateZoom = settings.templateZoom.get(binding.template.name)
            if (templateZoom) {
                browser.tabs.setZoom(tabId, templateZoom.zoomFactor)
                    .catch(e => console.log('Failed to zoom', e))
            }
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

function onZoomChange(zoomChangeInfo) {
    const {tabId, newZoomFactor} = zoomChangeInfo
    const binding = state.tabBindings.get(tabId)
    if (binding) {
        settings.templateZoom.set(binding.template.name, {zoomFactor: newZoomFactor})
        saveSettings()
    }
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

function entityLink(entityType, entity) {
    let ret = browser.runtime.getURL(`${EDITOR_PAGE}?${entityType}=${encodeURIComponent(entity.name)}`)
    if (entity.options.local) {
        ret += `&local`
    }
    return ret
}

function bindingInfo(binding) {
    if (binding) {
        const {parser, template} = binding
        return {
            parserName: parser.name,
            parserLink: entityLink('parser', parser),
            templateName: template.name,
            templateLink: entityLink('template', template)
        }
    }
}

function otherLooks(type, name) {
    return Array.from(settings.templates.values())
        .concat(Array.from(state.templates.values()))
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
        const template = getValue([settings.templates, state.templates], templateName)
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
        originalLookName: ORIGINAL_LOOK_NAME,
        url: tab.url
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
        const parser = createParser({text: entity.parser, link: entity.link || '', local: true})
        settings.parsers.set(parser.name, parser)
    } else if (entity.template) {
        const template = createTemplate({text: entity.template, link: entity.link || '', local: true})
        settings.templates.set(template.name, template)
    } else {
        throw new Error('Either parser or template must be set')
    }
    await saveSettings()
}

function getEntity(entity) {
    function stripEntity(e) {
        return {text: e ? e.options.text : '', link: e ? e.options.link : ''}
    }
    const store = entity.local ? settings : state
    if (entity.parser) {
        return stripEntity(store.parsers.get(entity.parser))
    } else if (entity.template) {
        return stripEntity(store.templates.get(entity.template))
    }
}

async function deleteLocalEntity(entity) {
    if (entity.parser) {
        settings.parsers.delete(entity.parser)
    } else if (entity.template) {
        settings.templates.delete(entity.template)
    }
    await saveSettings()
}

function finishRendering(tabId, options) {
    const binding = state.tabBindings.get(tabId)
    if (binding) {
        binding.renderingFinished = true
        if (options.executeInstagram) {
            return executeInstagramEmbedScript(tabId)
        }
    }
    return promise({})
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

    } else if ('get_entity' === msg.type) {
        return promise(getEntity(msg.entity))

    } else if ('delete_local_entity' === msg.type) {
        return deleteLocalEntity(msg.entity)

    } else if ('show_welcome_page' === msg.type) {
        showWelcomePage()
        return promise({})

    } else if ('get_test_pages' === msg.type) {
        return promise(getTestPages())

    } else if ('refresh_data' === msg.type) {
        return refreshData()

    } else if ('finish_rendering' === msg.type) {
        return finishRendering(sender.tab.id, msg)
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
browser.tabs.onZoomChange.addListener(onZoomChange)

initTabs().catch(e => console.log('Failed to init tabs', e))
