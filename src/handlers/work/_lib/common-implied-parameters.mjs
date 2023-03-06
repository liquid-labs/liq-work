const getCommonImpliedParameters = ({ actionDesc }) => [
  {
    name        : 'all',
    isBoolean   : true,
    description : 'Saves all projects associated with the unit of work. This option overrides `projects`.'
  },
  {
    name: 'projects',
    isMultivalue: true,
    description: `List of projects to ${actionDesc}. This option is ignored if \`all\` is specified.`
  }
]

export { getCommonImpliedParameters }
