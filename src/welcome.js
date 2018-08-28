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

function createElem(type, innerText) {
    const elem = document.createElement(type)
    if (innerText) {
        elem.innerText = innerText
    }
    return elem
}

async function load() {
    const {error, testPages} = await browser.runtime.sendMessage({type: 'get_test_pages'})
    if (error && 0 >= testPages.length) {
        errorText.innerText = error
        errorDiv.style.display = 'block'
        checkItDiv.style.display = 'none'
        return
    }
    testPages.sort((a, b) => a.name.localeCompare(b.name))
    testPages.forEach(p => {
        looksDiv.appendChild(createElem('b', p.name))
        const ul = createElem('ul')
        p.urls.forEach(u => {
            const a = createElem('a', u)
            a.href = u
            a.target = '_blank'
            const li = createElem('li')
            li.appendChild(a)
            ul.appendChild(li)
        })
        looksDiv.appendChild(ul)
    })
}

load().catch(e => looksDiv.appendChild(createElem('p', 'Failed to load test pages: ' + e)))
