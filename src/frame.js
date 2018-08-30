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

/* global moyedCont, settingsBut, advancedBut, advancedCont */

'use strict'

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

function addLinkButton(parentNode, caption, tooltip, href) {
    const link = document.createElement('button')
    link.innerText = caption
    if (href) {
        link.onclick = () => window.open(href, '_blank')
    }
    if (tooltip) {
        link.title = tooltip
    }
    link.classList.add('gap')
    parentNode.appendChild(link)
}

async function load() {
    const info = await browser.runtime.sendMessage({type: 'info'})
    const {binding, otherLooks, originalLookName} = info
    if (binding) {
        addLook(binding.templateName, 'active')
        addLinkButton(settingsBut.parentNode, 'Open parser', binding.parserName, binding.parserLink)
        addLinkButton(settingsBut.parentNode, 'Open template', binding.templateName, binding.templateLink)
    } else {
        addLook(originalLookName, 'active', 'original')
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

load().catch(e => console.log('Failed to load Moy info', e))

document.addEventListener('click', onDocumentClick)
settingsBut.onclick = () => window.open(browser.extension.getURL('src/settings.html'), '_blank')
advancedBut.onclick = () => {
    const hidden = 'none' === advancedCont.style.display
    advancedCont.style.display = hidden ? 'block' : 'none'
    return false
}
