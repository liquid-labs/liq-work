import createError from 'http-errors'

import { extractParameters } from '@liquid-labs/condition-eval'

const prepareQuestionsFromControls = ({ title, key, controlSetMap }) => {
  const controlSetBurndownList = Object.keys(controlSetMap)
  const controlSetsProcessed = []
  const questionBundle = {
    title,
    key,
    actions        : [],
    varsReferenced : [],
    env            : {}
  }

  for (let questionBundleSubSet = processNextControlSet({ controlSetMap, controlSetBurndownList, controlSetsProcessed });
    questionBundleSubSet !== null;
    questionBundleSubSet = processNextControlSet({ controlSetMap, controlSetBurndownList, controlSetsProcessed })) {
    questionBundle.actions.push(...questionBundleSubSet.actions)
    questionBundle.varsReferenced.push(...questionBundleSubSet.varsReferenced)
  }

  questionBundle.actions.push({ review : 'questions' })

  // filter out duplicate vars
  questionBundle.varsReferenced = questionBundle.varsReferenced.filter((v, i, arr) => i === arr.indexOf(v))

  return questionBundle
}

const processNextControlSet = ({ controlSetMap, controlSetBurndownList, controlSetsProcessed }) => {
  for (const ctrlSetName of controlSetBurndownList) {
    const { controls, depends } = controlSetMap[ctrlSetName]
    if (depends === undefined || controlSetsProcessed.includes(ctrlSetName)) {
      const questionBundle = processControls({ controls })
      controlSetBurndownList.splice(controlSetBurndownList.indexOf(ctrlSetName), 1)
      controlSetsProcessed.push(ctrlSetName)
      return questionBundle
    }
  }
  // because we return within the for-loop, we should only fall out when we're completely done

  if (controlSetBurndownList.length === 0) { return null }
  else {
    throw createError.BadRequest(`There are unmet dependencies in control sets: ${controlSetBurndownList.join(', ')}`)
  }
}

const processControls = ({ controls }) => {
  const allActions = []
  for (const { actions } of controls) {
    if (actions !== undefined) { allActions.push(...actions) }
  }

  return {
    actions        : allActions,
    varsReferenced : extractAllParameters({ actions : allActions })
  }
}

const extractAllParameters = ({ actions }) => {
  const allVars = []
  for (const { parameter, condition, elseSource, maps } of actions) {
    if (parameter !== undefined) { allVars.push(parameter) }
    if (condition !== undefined) { allVars.push(...extractParameters({ expression : condition })) }
    if (elseSource !== undefined) { allVars.push(...extractParameters({ expression : elseSource })) }
    if (maps !== undefined) {
      allVars.push(...extractMappingParamters({ maps }))
    }
  }

  return allVars
}

const extractMappingParamters = ({ maps }) => {
  const allVars = []
  for (const { parameter, source } of maps) {
    allVars.push(parameter)
    if (source !== undefined) { allVars.push(...extractParameters({ expression : source })) }
  }

  return allVars
}

export { prepareQuestionsFromControls }
