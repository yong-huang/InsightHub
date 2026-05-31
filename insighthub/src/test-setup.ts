import '@testing-library/jest-dom/vitest'

// Node 25+ provides a broken globalThis.localStorage stub (no clear/getItem/setItem).
// Even vitest's jsdom environment inherits this broken stub. Create a fresh jsdom
// instance to get a working localStorage, then replace the global.
const { JSDOM } = await import('jsdom')
const dom = new JSDOM('', { url: 'http://localhost' })
const jsdomStorage = dom.window.localStorage

// Replace globalThis.localStorage with the working jsdom one
Object.defineProperty(globalThis, 'localStorage', {
  value: jsdomStorage,
  writable: true,
  configurable: true,
})

// Also fix window.localStorage if it's broken (vitest's env might inherit Node 25's stub)
if (typeof window.localStorage?.clear !== 'function') {
  Object.defineProperty(window, 'localStorage', {
    value: jsdomStorage,
    writable: true,
    configurable: true,
  })
}

// Mock scrollIntoView (not implemented in jsdom)
if (typeof Element.prototype.scrollIntoView !== 'function') {
  Object.defineProperty(Element.prototype, 'scrollIntoView', {
    value: function (_options?: any) {},
    writable: true,
    configurable: true,
  })
}
