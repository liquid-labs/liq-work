import { extractParameters } from '@liquid-labs/condition-eval'

const prepareQuestionsFromControls = ({ title, key, controlsSpec }) => {
  const questionBundle = {
    title,
    key,
    actions        : [],
    varsReferenced : [],
    env            : {}
  }

  for (const { actions } of controlsSpec.controls) {
    questionBundle.actions.push(...actions)
  }

  questionBundle.varsReferenced = extractAllParameters({ actions : questionBundle.actions })

  return questionBundle
}

const extractAllParameters = ({ actions }) => {
  const allVars = []
  for (const { parameter, condition, elseSource, maps } of actions) {
    if (parameter !== undefined) { allVars.push(parameter) }
    if (condition !== undefined) { allVars.push(...extractParameters({ expression : condition })) }
    if (elseSource !== undefined) { allVars.push(...extractParameters({ expression : elseSource })) }
    if (maps !== undefined) {
      allVars.push(...extractMappingParameters({ maps }))
    }
  }

  return allVars
}

const extractMappingParameters = ({ maps }) => {
  const allVars = []
  for (const { parameter, source } of maps) {
    allVars.push(parameter)
    if (source !== undefined) { allVars.push(...extractParameters({ expression : source })) }
  }

  return allVars
}

export { prepareQuestionsFromControls }
