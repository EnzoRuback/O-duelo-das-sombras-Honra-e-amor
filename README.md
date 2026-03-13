# O Duelo das Sombras: Honra e Amor

## 1. Visão Geral
**O Duelo das Sombras: Honra e Aço** é um jogo de luta técnico 2D estilo Boss Rush com foco na mecânica de Defesa (Parry) e Postura, rodando no navegador.

**Estilo Visual:** Minimalista (Silhuetas negras).

## 2. Controles Básicos
* `Setas Esquerda/Direita` (ou `A/D`): Movimentam o personagem (jogador de preto, à esquerda).
* `J`: Ataque Leve (Mais rápido, menor dano, menor risco).
* `K`: Ataque Pesado (Mais lento, travamento maior, maior dano).
* `Shift`: Esquiva.
* `F` (Segurar): Bloqueio / Defesa.
    * **Perfect Parry**: Se você apertar `F` exatamente no momento do impacto (janela de 150ms), você anula totalmente o dano à sua postura e quebra massivamente a postura do inimigo.
    * **Bloqueio Normal**: Mitiga 100% do dano de HP, mas absorve 50% do dano da arma rival como Dano de Postura.
## 3. Mecânica de Combos
* Se você utilizar o ataque leve(j) duas vezes + ataque pesado(k), irá realizar uma investida.
* Se você utilizar a esquiva(shift) + ataque pesado, irá relizar um corte.

## 3. Mecânica do Core Loop
* Observe a silhueta inimiga.
* **POSTURA (Barra Amarela)**: É o aspecto mais importante do combate. Se a barra chegar em 100%, o personagem ficará Atordoado (STUN) por um tempo, completamente vulnerável.
* Afaste-se por 3 segundos sem tomar nenhum hit e a postura se regenerará sozinha suavemente.

## 4. Boss Rush Fases
1. **O Portão (Sentinela)**: Treine seu tempo de Parry contra seus ataques pesados e previsíveis na fase neutra de tom cinza.
2. **A Ponte (Duelista Ágil)**: Requer que você observe e gerencie muito mais a sua Postura, pois os ataques desta fase ensolarada (laranja) são muito mais rápidos.
3. **O Trono (O Shogun)**: Desafio extremo. Um líder mestre que varia entre leve e pesado em um fundo vermelho sangue. Exige reflexos perfeitos.

## Como Executar
Basta abrir o arquivo `index.html` em seu navegador web (Google Chrome, Firefox, Edge, Safari, etc.) para iniciar o jogo instantaneamente, ou faça o upload via GitHub Pages.

> Criado por Enzo Ruback com prompts no Antigravity.
