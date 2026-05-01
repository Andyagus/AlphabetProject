import { mountLetterA } from "./letters/letter-a.js";

const letters = "ABCDEFGHIJKLMNOPQRSTUVWXYZ".split("");
const grid = document.querySelector("#letter-grid");

const experiments = letters.map((letter) => ({
  letter,
  title: `Letter ${letter}`,
  info:
    letter === "A"
      ? "Inspired by Jeff Koons's Rabbit (1986): reflective inflated metal translated into a Blender cloth puff, exported as GLB shape keys, then animated directly in the browser."
      : `Open slot for a future ${letter} study.`,
  mount: letter === "A" ? mountLetterA : null,
}));

for (const experiment of experiments) {
  const letterPath = `#letter-${experiment.letter.toLowerCase()}`;
  const card = document.createElement("article");
  card.className = "letter-card";
  card.id = `letter-${experiment.letter.toLowerCase()}`;
  card.dataset.letter = experiment.letter;

  const stage = document.createElement("div");
  stage.className = "letter-stage";

  if (!experiment.mount) {
    const stageLink = document.createElement("a");
    stageLink.className = "letter-stage-link";
    stageLink.href = letterPath;
    stageLink.ariaLabel = experiment.title;
    stage.append(stageLink);
  }

  const infoPanel = document.createElement("div");
  infoPanel.className = "letter-info-panel";
  infoPanel.hidden = true;

  const infoText = document.createElement("span");
  infoText.textContent = experiment.info;

  infoPanel.append(infoText);
  stage.append(infoPanel);

  const label = document.createElement("p");
  label.className = "letter-label";

  const labelButton = document.createElement("button");
  labelButton.className = "letter-label-button";
  labelButton.type = "button";
  labelButton.textContent = experiment.title;
  labelButton.ariaExpanded = "false";
  labelButton.ariaControls = `${card.id}-info`;
  infoPanel.id = `${card.id}-info`;
  label.append(labelButton);

  card.append(stage, label);
  grid.append(card);

  if (experiment.mount) {
    stage.classList.add("is-interactive");
    experiment.mount(stage);
  }

  labelButton.addEventListener("click", () => {
    const willOpen = infoPanel.hidden;

    for (const panel of grid.querySelectorAll(".letter-info-panel")) {
      panel.hidden = true;
    }

    for (const button of grid.querySelectorAll(".letter-label-button")) {
      button.ariaExpanded = "false";
    }

    infoPanel.hidden = !willOpen;
    labelButton.ariaExpanded = String(willOpen);
  });

  stage.addEventListener("click", (event) => {
    if (event.target.closest(".letter-info-panel")) return;

    infoPanel.hidden = true;
    labelButton.ariaExpanded = "false";
  });
}

document.addEventListener("keydown", (event) => {
  if (event.key !== "Escape") return;

  for (const panel of grid.querySelectorAll(".letter-info-panel")) {
    panel.hidden = true;
  }

  for (const button of grid.querySelectorAll(".letter-label-button")) {
    button.ariaExpanded = "false";
  }
});
