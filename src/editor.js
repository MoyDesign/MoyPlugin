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

/* global saveBut, textArea */

'use strict'

const PARSER_HELP = 'https://github.com/MoyDesign/MoyDocs/blob/master/docs/parser.md#parser'
const TEMPLATE_HELP = 'https://github.com/MoyDesign/MoyDocs/blob/master/docs/template.md#template'
const GENERAL_HELP = 'https://github.com/MoyDesign/MoyDocs/blob/master/README.md#contents'

const ARTICLE_PARSER_STUB = `info:
  name: 
  description: 
  type: article
  domain: 
  path: 
  testPages: 

rules: 
  - name: logo_small_img_src
    value: 

  - name: author_img_src
    match: 

  - name: author
    match: 

  - name: author_link
    match: 

  - name: date
    match: 

  - name: title
    match: 

  - name: body
    match: 

  - name: comment
    match: 
    rules:
      - name: indent
        match: 

      - name: author_img_src
        match: 

      - name: author_link
        match: 

      - name: author
        match: 

      - name: date
        match: 

      - name: body
        match: 
`

const FEED_PARSER_STUB = `info:
  name: 
  description: 
  type: feed
  domain: 
  path: 

rules:
  - name: logo_small_img_src
    match: 

  - name: nav_prev_link
    match: 

  - name: nav_prev
    match: 

  - name: nav_next_link
    match: 

  - name: nav_next
    match: 

  - name: article
    match: 
    rules:
      - name: author_img_src
        match: 

      - name: author
        match: 

      - name: author_link
        match: 

      - name: title
        match: 

      - name: title_link
        match: 

      - name: body
        match: 

      - name: date
        match: 

      - name: comments
        match: 

      - name: comments_link
        match: 

      - name: new_comment
        match: 

      - name: new_comment_link
        match: 
`

const STUBS = {article: ARTICLE_PARSER_STUB, feed: FEED_PARSER_STUB}

const query = parseQuery(location.search)
const isParser = query.hasOwnProperty('parser')
const isTemplate = query.hasOwnProperty('template')

function parseQuery(queryString) {
    const query = {}
    const pairs = (queryString[0] === '?' ? queryString.substr(1) : queryString).split('&')
    for (let i = 0; i < pairs.length; i++) {
        const pair = pairs[i].split('=')
        query[decodeURIComponent(pair[0])] = decodeURIComponent(pair[1] || '')
    }
    return query
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
    if (query.parser) {
        entity.parser = query.parser
    } else if (query.template) {
        entity.template = query.template
    } else {
        return
    }
    sendMessageOnClick({type: 'delete_local_entity', entity: entity}, saveBut)
        .catch(e => console.log('Failed to delete', e))
}

function onHelpClick() {
    let url
    if (isParser) {
        url = PARSER_HELP
    } else if (isTemplate) {
        url = TEMPLATE_HELP
    } else {
        url = GENERAL_HELP
    }
    window.open(url, '_blank')
}

async function load() {
    const entity = {}
    if (query.parser) {
        entity.parser = query.parser
    } else if (query.template) {
        entity.template = query.template
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
helpBut.onclick = onHelpClick
textArea.oninput = dirty
if (!query.parser && !query.template) {
    deleteBut.style.display = 'none'
    if (query.stub && STUBS.hasOwnProperty(query.stub)) {
        textArea.value = STUBS[query.stub]
    }
}