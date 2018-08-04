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

!(function() {

    let element

    function unload() {
        if (element) {
            element.remove()
        }
        browser.runtime.onMessage.removeListener(handleMsg)
    }

    function handleMsg(msg) {
        if ('unload' === msg.type) {
            unload()
        }
        return new Promise(resolve => resolve(true))
    }

    let frame = document.createElement('iframe')

    frame.style.border = 'none'
    frame.style.display = 'block'
    frame.style.width = '100%'
    frame.style.height = '100px'
    frame.style.overflow = 'hidden'
    frame.style.position = 'fixed'
    frame.style.right = 0
    frame.style.top = 0
    frame.style.left = 'auto'
    frame.style.float = 'none'
    frame.style.zIndex = 2147483647

    frame.src = browser.extension.getURL('src/frame.html')

    element = document.body.appendChild(frame)

    browser.runtime.onMessage.addListener(handleMsg)
})()
