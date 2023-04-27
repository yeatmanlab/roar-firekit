# roar-firekit

Welcome to roar-firekit! Roar-firekit helps you store the data from your [ROAR application](https://dyslexia.stanford.edu/roar/) in [Cloud Firestore](https://cloud.google.com/firestore).

## Installation

You can install [roar-firekit from npm](https://www.npmjs.com/package/@bdelab/roar-firekit) with

```bash
npm i @bdelab/roar-firekit
```

## Usage

Roar-firekit is agnostic about where your data comes from, but I anticipate most users will use roar-firekit with their experiments written in [jsPsych](https://www.jspsych.org/).

The main entrypoint to roar-firekit's API is the [[`RoarAppkit`]] class.  Its
constructor expects an object with keys `userInfo`, `taskInfo`, and `config`, where
`userInfo` is a [[`IUserData`]] object, `taskInfo` is a
[[`ITaskVariantInput`]] object, and `config` is a [[`AssessmentConfigData`]] object.

### Constructor inputs

#### `userInfo`

User information is encapsulated in a [[`IUserData`]] object. Its only required
key is `id`, which should be the current user's ROAR UID, which is also sometimes called the ROAR PID:

```javascript
const minimalUserInfo = { id: 'roar-user-id' };
```

But you can supply other information about the user if you know it:

```javascript
const fullUserInfo = {
  id: 'roar-user-id',
  birthMonth: 7,
  birthYear: 2014,
  classId: 'roar-class-id',
  schoolId: 'roar-school-id',
  districtId: 'roar-district-id',
  studyId: 'roar-study-id',
  userCategory: 'student',
}
```

#### `taskInfo`

Information about the current task is encapsulated in a [[`ITaskVariantInput`]] object. Here is the task information for a fictitious "Not Hotdog" task:

```javascript
const taskInfo = {
  taskId: 'nhd',
  taskName: 'Not Hotdog',
  variantName: 'Not Hotdog, one block',
  taskDescription: 'A demonstration task using the hot dog / not hot dog problem',
  variantDescription: 'One block, random order',
  blocks: [
    {
      blockNumber: 1,
      trialMethod: "random-without-replacement",
      corpus: "pointer-to-location-of-stimulus-corpus",
    },
  ]
}
```

#### `config`

The config object contains configuration information for your Firebase project. You may want to store your config object in separate javascript file (named "roarConfig.js" for this documentation). A template is provided below

<details>
  <summary>Click to expand!</summary>

  ```javascript
  export const roarConfig = {
    "firebaseConfig": {
      "apiKey": "insert your firebase API key here",
      "authDomain": "insert your firebase auth domain here",
      "projectId": "insert your firebase project ID here",
      "storageBucket": "insert your firebase storage bucket here",
      "messagingSenderId": "insert your firebase messaging sender ID here",
      "appId": "insert your firebase app ID here",
      "measurementId": "insert your firebase measurement ID here",
    },
    "rootDoc": ["some collection name", "some document name"],
  }
  ```

</details>

##### `firebaseConfig`

To get the `firebaseConfig` fields, see [this article](https://support.google.com/firebase/answer/7015592#zippy=%2Cin-this-article) on how to retrieve your firebase config. TLDR: go directly to [your project's settings](https://console.firebase.google.com/project/_/settings/general/), scroll down to "SDK setup and configuration," click the "Config" radio button, and copy the snippet for your app's Firebase config object.

##### `rootDoc`

The `rootDoc` is an array of strings representing the document under which all ROAR data will be stored.  Note that `rootDoc` does not have to be in the actual root of your Cloud Firestore database.

### Constructing the firekit

With the above defined input, you would construct a firekit using

```javascript
import { RoarAppkit } from '@bdelab/roar-firekit';
import { roarConfig } from './roarConfig.js';

// Insert input definition code from above

const firekit = new RoarAppkit({
  userInfo: minimalUserInfo,
  taskInfo,
  config: roarConfig,
})
```

## Starting a run

Starting a run writes the user, task, and run information to Cloud Firestore:

```javascript
await firekit.startRun();
```

If you are using roar-firekit with jsPsych, you should call this method before
experiment starts, either by awaiting it before the `jsPsych.run` method,

```javascript
await firekit.startRun();
jsPsych.run(timeline);
```

or by calling it as part of the `on_timeline_start` callback,

```javascript
const procedure = {
  timeline: [trial1, trial2],
  on_timeline_start: function() {
    await firekit.startRun();
  }
}
```

## Writing a trial to Firestore

After starting a run, you can write individual trial data to Cloud Firestore using the `writeTrial` method.
This method can be added to individual jsPsych trials by calling it from
the `on_finish` function, like so:

```javascript
var trial = {
  type: 'image-keyboard-response',
  stimulus: 'imgA.png',
  on_finish: function(data) {
   firekit.writeTrial(data);
  }
};
```

Or you can call it from all trials in a jsPsych
timeline by calling it from the `on_data_update` callback. In this
case, you can avoid saving extraneous trials by conditionally calling
this method based on the data. For example:

```javascript
initJsPsych({
  on_data_update: function(data) {
    if (data.saveToFirestore) {
      firekit.addTrialData(data);
    }
  }
});
const timeline = [
  // A fixation trial; don't save to Firestore
  {
    type: htmlKeyboardResponse,
    stimulus: '<div style="font-size:60px;">+</div>',
    choices: "NO_KEYS",
    trial_duration: 500,
  },
  // A stimulus and response trial; save to Firestore
  {
    type: imageKeyboardResponse,
    stimulus: 'imgA.png',
    data: { saveToFirestore: true },
  }
]
```

## Finishing a run

After your experiment is over, you can mark it as completed in Firestore using the `finishRun` method. For example, you can call this method in the [`on_finish` (experiment) callback](https://www.jspsych.org/7.1/overview/events/#on_finish-experiment):

```javascript
initJsPsych({
  on_finish: function(data) {
    firekit.finishRun();
  }
});
```

## Full example

The following is an example jsPsych experiment that implements the NoHotdog assessment while writing data to Cloud Firestore using roar-firekit.

<details>
  <summary>Click to expand!</summary>

  ```javascript
  import { initJsPsych } from 'jspsych';
  import preload from '@jspsych/plugin-preload';
  import htmlKeyboardResponse from '@jspsych/plugin-html-keyboard-response';
  import imageButtonResponse from '@jspsych/plugin-image-button-response';
  import { RoarAppkit } from '@bdelab/roar-firekit';
  import { roarConfig } from "./roarConfig.js";

  const taskInfo = {
    taskId: 'nhd',
    taskName: 'Not Hotdog',
    variantName: 'nhd-1block-random',
    taskDescription: 'A ROAR demonstration using the hot dog / not hot dog task.',
    variantDescription: 'One block, random order',
    blocks: [
      {
        blockNumber: 1,
        trialMethod: 'random-without-replacement',
        corpus: 'assets',
      },
    ],
  };

  const minimalUserInfo = { id: 'roar-user-id' };

  const firekit = new RoarAppkit({
    userInfo: minimalUserInfo,
    taskInfo,
    config: roarConfig,
  });

  await firekit.startRun();

  const jsPsych = initJsPsych({
    on_data_update: function (data) {
      if (data.saveToFirestore) {
        firekit.writeTrial(data);
      }
    },
    on_finish: function () {
      firekit.finishRun();
    },
  });

  // This example assumes that the hot dog / not hot dog images are stored in the
  // assets folder.
  const numFiles = 30;
  const hotDogFiles = Array.from(Array(numFiles), (_, i) => i + 1).map(
    (idx) => new URL(`../assets/hotdog/${idx}.jpg`, import.meta.url),
  );
  const notHotDogFiles = Array.from(Array(numFiles), (_, i) => i + 1).map(
    (idx) => new URL(`../assets/nothotdog/${idx}.jpg`, import.meta.url),
  );
  const allFiles = hotDogFiles.concat(notHotDogFiles);
  const allTargets = allFiles.map((url) => {
    return { target: url, isHotDog: !url.pathname.includes('nothotdog') };
  });

  let timeline = [];

  /* preload images */
  const preloadImages = {
    type: preload,
    auto_preload: true,
  };
  timeline.push(preloadImages);

  /* define welcome message trial */
  const welcome = {
    type: htmlKeyboardResponse,
    stimulus: 'Welcome to ROAR-HD, a rapid online assessment of hot dog differentiating ability. Press any key to begin.',
  };
  timeline.push(welcome);

  const hotDogTrials = {
    timeline: [
      {
        type: htmlKeyboardResponse,
        stimulus: '<div style="font-size:60px;">+</div>',
        choices: 'NO_KEYS',
        trial_duration: 500,
      },
      {
        type: imageButtonResponse,
        stimulus: jsPsych.timelineVariable('target'),
        choices: ['Hot Dog', 'Not a Hot Dog'],
        prompt: 'Is this a hot dog?',
        data: { saveToFirestore: true },
        on_finish: function (data) {
          data.correct = jsPsych.timelineVariable('isHotDog') == data.response;
        },
      },
    ],
    timeline_variables: allTargets,
    sample: {
      type: 'without-replacement',
      size: 20,
    },
  };

  timeline.push(hotDogTrials);

  const fixation = {
    type: htmlKeyboardResponse,
    stimulus: 'You are all done. Thanks!',
    choices: 'NO_KEYS',
  };
  timeline.push(fixation);

  jsPsych.run(timeline);
  ```

</details>
