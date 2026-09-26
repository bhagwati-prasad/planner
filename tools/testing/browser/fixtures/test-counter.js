// A small element for the harness's own tests: a button that counts its clicks.
class TestCounter extends HTMLElement {
  static observedAttributes = ['label']
  #count = 0
  #button = document.createElement('button')

  constructor() {
    super()
    this.attachShadow({ mode: 'open' }).append(this.#button)
    this.#button.addEventListener('click', () => {
      this.count = this.#count + 1
    })
  }

  get count() {
    return this.#count
  }
  set count(value) {
    this.#count = value
    this.#render()
  }

  attributeChangedCallback() {
    this.#render()
  }

  #render() {
    this.#button.textContent = `${this.getAttribute('label') ?? 'Count'}: ${this.#count}`
  }
}

customElements.define('test-counter', TestCounter)
