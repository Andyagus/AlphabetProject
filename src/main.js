import { mountLetterA } from "./letters/letter-a.js";

const letters = "ABCDEFGHIJKLMNOPQRSTUVWXYZ".split("");
const grid = document.querySelector("#letter-grid");

const experiments = letters.map((letter) => ({
  letter,
  title: `Letter ${letter}`,
  mount: letter === "A" ? mountLetterA : null,
}));

for (const experiment of experiments) {
  const card = document.createElement("article");
  card.className = "letter-card";
  card.dataset.letter = experiment.letter;

  const stage = document.createElement("div");
  stage.className = "letter-stage";

  const label = document.createElement("p");
  label.className = "letter-label";
  label.textContent = experiment.title;

  card.append(stage, label);
  grid.append(card);

  if (experiment.mount) {
    stage.classList.add("is-interactive");
    experiment.mount(stage);
  }
}
