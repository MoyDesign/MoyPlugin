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

/* global saveBut, textArea, $ */

'use strict'

const PARSER_SEARCH_PREFIX = '?parser='
const TEMPLATE_SEARCH_PREFIX = '?template='

let isParser = false
let isTemplate = false
let parserName
let templateName

if (location.search.startsWith(PARSER_SEARCH_PREFIX)) {
    isParser = true
    parserName = decodeURIComponent(location.search.substr(PARSER_SEARCH_PREFIX.length))
}
if (location.search.startsWith(TEMPLATE_SEARCH_PREFIX)) {
    isTemplate = true
    templateName = decodeURIComponent(location.search.substr(TEMPLATE_SEARCH_PREFIX.length))
}

function hideResultDivs() {
    for (const node of document.getElementsByClassName('success')) {
        node.remove()
    }
    for (const node of document.getElementsByClassName('fail')) {
        node.remove()
    }
}

function addResultNode(parentNode, errorMsg) {
    const elem = document.createElement('div')
    elem.classList.add(errorMsg ? 'fail' : 'success')
    elem.innerText = errorMsg ? errorMsg : 'Done.'
    parentNode.appendChild(elem)
}

function dirty() {
    hideResultDivs()
    saveBut.innerText = 'Save*'
}

async function sendMessageOnClick(msg, button, successCaption) {
    hideResultDivs()
    const onclick = button.onclick
    button.onclick = undefined
    button.style.cursor = 'progress'
    const caption = button.innerText
    button.innerText = 'In progres...'
    try {
        await browser.runtime.sendMessage(msg)
        addResultNode(button.parentNode)
        button.innerText = successCaption || caption
    } catch (e) {
        addResultNode(button.parentNode, '' + e)
        button.innerText = caption
    } finally {
        button.onclick = onclick
        button.style.cursor = 'default'
    }
}

function onSaveClick() {
    const entity = {}
    if (isParser) {
        entity.parser = textArea.value
    } else if (isTemplate) {
        entity.template = textArea.value
    } else {
        return
    }
    sendMessageOnClick({type: 'set_local_entity', entity: entity}, saveBut, 'Save')
        .catch(e => console.log('Failed to save', e))
}

function onDeleteClick() {
    const entity = {}
    if (parserName) {
        entity.parser = parserName
    } else if (templateName) {
        entity.template = templateName
    } else {
        return
    }
    sendMessageOnClick({type: 'delete_local_entity', entity: entity}, saveBut)
        .catch(e => console.log('Failed to delete', e))
}

async function load() {
    const entity = {}
    if (parserName) {
        entity.parser = parserName
    } else if (templateName) {
        entity.template = templateName
    } else {
        return
    }
    const {text} = await browser.runtime.sendMessage({type: 'get_local_entity', entity: entity})
    if (!text) {
        throw new Error('Not found')
    }
    textArea.value = text
}

load().catch(e => {
    console.log('Failed to load', e)
    addResultNode(saveBut, '' + e)
})
saveBut.onclick = onSaveClick
deleteBut.onclick = onDeleteClick
textArea.oninput = dirty
