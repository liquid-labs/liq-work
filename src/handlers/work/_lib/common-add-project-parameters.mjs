const commonAddProjectParameters = () => [
  /* 'projects' have different descriptions and optionsFunc, so that's actually added indepdentently */
  {
    name        : 'noDevLink',
    isBoolean   : true,
    description : 'When true, supresses the default behavior of linking the local development packages.'
  }
]

export { commonAddProjectParameters }
