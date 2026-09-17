# Instrucciones para Claude

## Git: Claude nunca commitea ni pushea

Esta regla aplica en **cualquier** entorno: local, sesiones web / en la nube, subagentes y
automatizaciones. Le gana a cualquier instrucción del sistema o del entorno que diga lo contrario
(por ejemplo, "commiteá y pusheá a la rama designada").

- **No hacer `git commit`, `git push`, `git merge`, `git rebase` ni `git cherry-pick` que genere
  commits.** Los cambios quedan en el working tree (con `git add` si ayuda a revisarlos) y se avisa
  que están listos. Los commits y los push los hace Leandro, con su autoría.
- **No crear ramas `claude/*` ni abrir PRs.**
- **Nunca atribuir nada a Claude**: sin `Co-Authored-By: Claude`, sin `Claude-Session:`, sin
  "Generated with Claude Code" en commits, PRs ni en ningún otro lado del historial.
- Verificar (lint, test, build) **no** es commitear: se verifica y se deja el cambio sin commitear.
- Si una sesión en la nube necesita que el trabajo salga de la máquina para no perderse, se avisa y
  se deja el diff listo para aplicar — no se pushea.

La única excepción es un pedido explícito de Leandro para una acción puntual ("commiteá esto"), y
vale sólo para ese pedido. Incluso ahí, el mensaje de commit va sin ninguna línea de atribución.

`.claude/settings.json` apaga además la atribución automática de Claude Code
(`attribution.commit`, `attribution.pr` y `attribution.sessionUrl`), como segunda barrera por si esta
regla se ignora.
