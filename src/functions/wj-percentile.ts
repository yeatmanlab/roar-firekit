import * as path from "path";
import * as Papa from "papaparse";
import {
  DocumentData,
} from "firebase-admin/firestore";
import { QueryCloudStorage } from "./query-cloud-storage";
import { SWR_LOOKUP_TABLE_VERSION, TASK_ID_SWR } from "./config";

export class WJPercentile {
  private clientCloudStorage;
  
  constructor() {
    this.clientCloudStorage = new QueryCloudStorage(); // to query cloud storage
  }
  
  // TODO: remove this function from firebase-functions
  // the lookup tables are stored in the root folder "/lookup-tables"
  // the file name follows the convention [TASK ID]-theta-table-[VERSION ID].csv
  public getLookupTablePath(taskId: string, version: string) {
    return path.join("lookup-tables", `${taskId}-theta-table-${version}.csv`);
  }
  
  private cleanAge(age: string) {
    const adultAge = 18;

    // sanity check to make sure age is defined
    if (age === undefined || age === null) {
      return null;
    }

    // get the age after removing the whitespace
    age = age.trim();

    // return null scores if age is not valid
    if (age === "Adult") {
      return adultAge;
    } else if (age === "") {
      return null;
    }

    // remove the trailing '+' if it exists, 10+ => 10
    if (age.endsWith("+")) {
      age = age.slice(0, -1);
    }

    // convert age to a Number and then convert to months
    // TODO: check if these are in months or years
    // TODO: if age is in months then this conversion should not happen
    return Number(age) * 12;
  }

  private async getWJPercentileScoreForRun(
    runData: DocumentData,
    table: Array<DocumentData>
  ) {
    // TODO: check if age is in months or years
    const ageInMonths = this.cleanAge(runData.age);

    const percentileScore = {
      standardScore: null,
      wjPercentile: null,
      roarScore: null,
      ageInMonths: ageInMonths,
      // TODO: call it rawAgeInMonths or rawAge depending on age being in months or years
      age: runData.age,
    };

    // return null if age is invalid or if we do not have thetaEstimate value
    if (ageInMonths === null || runData.thetaEstimate === "") {
      return percentileScore;
    }

    // get all rows with the exact age
    const rows: Array<FirebaseFirestore.DocumentData> = [];
    Papa.parse(table, {
      header: true,
      step: (row) => {
        if (ageInMonths === Number(row.data.agemonths)) rows.push(row);
      },
    });

    // get nearest neighbor for thetaEstimate
    let minimumThetaEstimateDifference = Number.POSITIVE_INFINITY;

    for (const row of rows) {
      const thetaEstimateDifference = Math.abs(
        Number(runData.thetaEstimate) - Number(row.data.thetaEstimate)
      );
      if (thetaEstimateDifference < minimumThetaEstimateDifference) {
        percentileScore.standardScore = row.data.StandardScore;
        percentileScore.wjPercentile = row.data.WJPercentile;
        percentileScore.roarScore = row.data.roar_score;
        minimumThetaEstimateDifference = thetaEstimateDifference;
      }
    }

    return percentileScore;
  }
  
  public async getWJPercentileScore(
    data: Array<DocumentData>,
    users: Record<string, string>,
    tableVersion: Number = SWR_LOOKUP_TABLE_VERSION
  ) {
    // read table
    const swrTablePath = this.getLookupTablePath(
      TASK_ID_SWR,
      tableVersion.toString()
    );
    const swrTable = await this.clientCloudStorage.readFile(swrTablePath);
    
    for (let i = 0; i < data.length; i++) {
      let runData = data[i];
      const firestorePid = runData.firestorePid;
      // TODO: check if age is in months
      runData.age = users[firestorePid];
      const percentileScores = await this.getWJPercentileScoreForRun(
        runData,
        swrTable
      );
      data[i] = {
        ...percentileScores,
        ...runData,
      };
    }
    
    return data;
  }
};
