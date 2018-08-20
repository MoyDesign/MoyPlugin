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

function hide(...elems) {
    for (const elem of elems) {
        elem.style.display = 'none'
    }
}

async function openDraft(existing, draftType) {
    hide(confirmDialog)
    await browser.runtime.sendMessage({type: 'open_draft', existing: existing, draftType: draftType})
}

async function switchLook(name) {
    await browser.runtime.sendMessage({type: 'switch_look', name: name})
}

function addLook(name, ...classes) {
    const look = document.createElement('button')
    look.innerText = name
    look.classList.add('gap')
    look.classList.add(...classes)
    if (!classes.includes('active')) {
        look.onclick = () => switchLook(name).catch(e => console.log('Failed to load look', e))
    }
    moyedCont.appendChild(look)
}

async function load() {
    const info = await browser.runtime.sendMessage({type: 'info'})
    const {binding, otherLooks, originalLookName} = info
    if (binding) {
        addLook(binding.templateName, 'active')
    } else {
        addLook(originalLookName, 'active', 'original')
        hide(overrideDraftBut)
    }
    if (otherLooks) {
        otherLooks.forEach(l => addLook(l))
    }
    if (binding) {
        addLook(originalLookName, 'original')
    }
}

function onDocumentClick(e) {
    const target = e.target || e.srcElement
    if (target === document.documentElement) {
        browser.runtime.sendMessage({type: 'unload'})
            .catch(e => console.log('Failed to unload frame', e))
    }
}

function onDraftClick(draftType) {
    openDraftBut.dataset.draftType = draftType
    overrideDraftBut.dataset.draftType = draftType
    overrideDraftBut.innerText = 'Override existing draft with current ' + draftType
    confirmDialog.style.display = 'block'
}

load().catch(e => console.log('Failed to load Moy info', e))

document.addEventListener('click', onDocumentClick)
settingsBut.onclick = () => window.open(browser.extension.getURL('src/settings.html'), '_blank')
advancedBut.onclick = () => {
    const hidden = 'none' === advancedCont.style.display
    advancedCont.style.display = hidden ? 'block' : 'none'
    return false
}
draftParserBut.onclick = () => onDraftClick('parser')
draftTemplateBut.onclick = () => onDraftClick('template')
openDraftBut.onclick =
    () => openDraft(true, openDraftBut.dataset.draftType).catch(e => console.log('Failed to open draft', e))
overrideDraftBut.onclick = 
    () => openDraft(false, overrideDraftBut.dataset.draftType).catch(e => console.log('Failed to override draft', e))
cancelBut.onclick = () => hide(confirmDialog)
