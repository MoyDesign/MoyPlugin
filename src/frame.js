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

const HELP_TEXT = 'Get help'
const HELP_URL = 'https://github.com/MoyDesign/MoyPlugin/blob/master/README.md#get-help'

function el(elemId) {
    return document.getElementById(elemId)
}

async function switchLook(name) {
    await browser.runtime.sendMessage({type: 'switch_look', name: name})
}

function addLook(name, ...classes) {
    const look = document.createElement('button')
    look.innerText = name
    look.classList.add('look')
    look.classList.add(...classes)
    if (!classes.includes('active')) {
        look.onclick = () => switchLook(name).catch(e => console.log('Failed to load look', e))
    }
    el('moyed').appendChild(look)
}

function addLink(text, href) {
    const link = document.createElement('a')
    link.href = href
    link.target = '_blank'
    link.innerText = text
    link.style.display = 'block'
    link.style.textAlign = 'center'
    el('moyed').appendChild(link)
}

async function load() {
    const info = await browser.runtime.sendMessage({type: 'info'})
    const {binding, otherLooks, originalLookName} = info
    if (binding) {
        addLook(binding.templateName, 'active')
    } else {
        addLook(originalLookName, 'active', 'original')
    }
    if (otherLooks) {
        otherLooks.forEach(l => addLook(l))
    }
    if (binding) {
        addLook(originalLookName, 'original')
    }
    addLink(HELP_TEXT, HELP_URL)
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
