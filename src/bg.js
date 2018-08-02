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

const SECOND = 1000
const MINUTE = 60 * SECOND
const HOUR = 60 * MINUTE

const GITHUB_URI_PREFIX = 'https://api.github.com/repos/MoyDesign/MoyData/contents/'
const PARSERS_DIR = 'MoyParsers'
const TEMPLATES_DIR = 'MoyTemplates'
const REFRESH_INTERVAL = 5 * HOUR
const CHECK_INTERVAL = 5 * MINUTE

let state = {
    parsers: new Map(),
    templates: new Map(),
    lastRefresh: 0,
    isRefreshing: false
}

async function fetchFile(githubFileInfo) {
    const resp = await fetch(githubFileInfo.download_url)
    return await resp.text()
}

async function fetchDir(dirname) {
    const resp = await fetch(GITHUB_URI_PREFIX + dirname)
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

async function fetchMap(dirname, fileFetcher) {
    const dir = await fetchDir(dirname)
    const entities = await Promise.all(dir.map(fileFetcher))
    return new Map(entities.map(e => [e.name, e]))
}

function refreshData() {
    if (!state.isRefreshing) {
        state.isRefreshing = true
        Promise.all([fetchMap(PARSERS_DIR, fetchParser), fetchMap(TEMPLATES_DIR, fetchTemplate)])
            .then(res => {
                state.parsers = res[0]
                state.templates = res[1]
            })
            .catch(e => console.log('Failed to refresh data', e))
            .finally(() => {
                state.lastRefresh = Date.now()
                state.isRefreshing = false
            })
    }
}

function periodicDataRefresh() {
    if (REFRESH_INTERVAL < Date.now() - state.lastRefresh) {
        refreshData()
    }
    setTimeout(periodicDataRefresh, CHECK_INTERVAL)
}

refreshData()
periodicDataRefresh()
