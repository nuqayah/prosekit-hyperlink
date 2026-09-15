import '@nuqayah/prosekit-hyperlink/styles.css'
import 'prosekit/basic/style.css'
import 'prosekit/basic/typography.css'
import './app.css'

import {mount} from 'svelte'

import App from './App.svelte'

const target = document.querySelector('#app')
if (!target) throw new Error('Missing demo mount point')

mount(App, {target})
