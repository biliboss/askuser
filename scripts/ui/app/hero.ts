// O plugin do HeroUI como ARQUIVO, porque o Tailwind v4 é CSS-first: não há
// `tailwind.config.js` pra receber `plugins: [heroui()]`, e o `@plugin` do CSS
// aponta pra um módulo. Uma linha, e é o único lugar que configura o tema.
import { heroui } from '@heroui/react'

export default heroui()
