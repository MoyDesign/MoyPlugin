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

function getDraftType() {
    const {searchParams} = PARSED_URL
    if (searchParams.has('parser')) {
        return 'parser'
    } else if (searchParams.has('template')) {
        return 'template'
    } else {
        throw new Error('Either parser or template argument must present')
    }
}

const PARSED_URL = new URL(window.location.href)
const DRAFT_TYPE = getDraftType()
const DRAFT_NAME = PARSED_URL.searchParams.get(DRAFT_TYPE)
const EXISTING = !DRAFT_NAME

let originalText

async function load() {
    const {text} = await browser.runtime.sendMessage({
        type: 'get_draft',
        existing: EXISTING,
        name: DRAFT_NAME,
        draftType: DRAFT_TYPE
    })
    originalText = text
    draftTextarea.value = text
}

async function save() {
    originalText = draftTextarea.value
    await browser.runtime.sendMessage({
        type: 'set_draft',
        draftType: DRAFT_TYPE,
        text: draftTextarea.value
    })
    PARSED_URL.searchParams.set(DRAFT_TYPE, '')
    window.location.href = '' + PARSED_URL
}

draftTypeSpan.innerText = DRAFT_TYPE
document.title = `Draft ${DRAFT_TYPE} - Moy.Design`

load().catch(e => console.log('Failed to load draft', e))
saveBut.onclick = () => save().catch(e => console.log('Failed to save draft', e))

window.onbeforeunload = (event) => {
    if (originalText && originalText !== draftTextarea.value) {
        event.preventDefault()
        event.returnValue = 'There are unsaved changes. Are you sure?'
    }
}
