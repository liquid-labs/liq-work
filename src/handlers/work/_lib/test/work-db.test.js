/* global describe expect test */
import * as fsPath from 'node:path'

import { WorkDB } from '../work-db'

describe('WorkDB', () => {
  test('Reads database on initialization from liq constants', () => {
    const app = { 
      liq : { 
        constants  : { WORK_DB_PATH : fsPath.join(__dirname, 'data', 'work-db-a', 'work-db.yaml') },
        playground : () => fsPath.join('..', '..')
      }
    }
    const workDB = new WorkDB({ app })

    expect(workDB.getData('work-liquid-labs/liq-work/1')).toBeTruthy()
  })
})
