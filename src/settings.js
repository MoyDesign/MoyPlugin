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

function hideResultDivs() {
    failDiv.style.display = 'none'
    successDiv.style.display = 'none'
}

function dirty() {
    hideResultDivs()
    saveBut.innerText = 'Save*'
}

async function save() {
    const newSettings = {
        githubUser: githubUserInput.value
    }
    hideResultDivs()
    saveBut.onclick = undefined
    saveBut.style.cursor = 'progress'
    saveBut.innerText = 'Saving...'
    try {
        await browser.runtime.sendMessage({type: 'set_settings', settings: newSettings})
        successDiv.style.display = 'block'
    } catch (e) {
        failDiv.style.display = 'block'
        failDiv.innerText = '' + e
    } finally {
        saveBut.onclick = onSaveClick
        saveBut.style.cursor = 'default'
        saveBut.innerText = 'Save'
    }
}

function onSaveClick() {
    save().catch(e => console.log('Failed to save settings', e))
}

function onWelcomePageClick() {
    browser.runtime.sendMessage({type: 'show_welcome_page'})
}

async function load() {
    const {settings, defaultSettings} = await browser.runtime.sendMessage({type: 'get_settings'})
    githubUserInput.value = settings.githubUser
    resetGithubUserBut.onclick = () => {
        githubUserInput.value = defaultSettings.githubUser
        onSaveClick()
        return false
    }
}

load().catch(e => console.log('Failed to load settings', e))
saveBut.onclick = onSaveClick
githubUserInput.oninput = dirty
welcomePageBut.onclick = onWelcomePageClick
