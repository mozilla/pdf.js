export const analyzePageStructureFixture = {
  sections: [
    {
      title: "Anatomy of the Somatosensory System",
      readingRelevance: 5,
      sentences: [
        {
          sentenceText: "Anatomy of the Somatosensory System",
          continuesOnNextPage: false,
        },
      ],
    },
    {
      title: "Introduction",
      readingRelevance: 5,
      sentences: [
        {
          sentenceText:
            "Our somatosensory system consists of sensors in the skin and sensors in our muscles, tendons, and joints.",
          continuesOnNextPage: false,
        },
        {
          sentenceText:
            "The receptors in the skin, the so called cutaneous receptors, tell us about temperature (thermoreceptors), pressure and surface texture (mechano receptors), and pain (nociceptors).",
          continuesOnNextPage: false,
        },
        {
          sentenceText:
            "The receptors in muscles and joints provide information about muscle length, muscle tension, and joint angles.",
          continuesOnNextPage: false,
        },
      ],
    },
    {
      title: "Cutaneous receptors",
      readingRelevance: 5,
      sentences: [
        {
          sentenceText:
            "Sensory information from Meissner corpuscles and rapidly adapting afferents leads to adjustment of grip force when objects are lifted.",
          continuesOnNextPage: false,
        },
        {
          sentenceText:
            "These afferents respond with a brief burst of action potentials when objects move a small distance during the early stages of lifting.",
          continuesOnNextPage: false,
        },
        {
          sentenceText: "In response to",
          continuesOnNextPage: true,
        },
      ],
    },
  ],
};
