import json
import random
import string
from datetime import datetime, timedelta, date
import copy
from faker import Faker

#################################
#  helpers for generating data  #
#################################
fake = Faker()

#region
def randomAlphaNumericString(length, prepend=""):
    return prepend + "".join(random.choices(string.ascii_lowercase + string.digits, k=length))


def arrayOfStrings(arrayLength, stringLength):
    return_array = []
    for _ in range(arrayLength):
        return_array.append(randomAlphaNumericString(stringLength))
    return return_array


def list_of_doc_ids(length):
    return [random_doc_id() for _ in range(length)]


def arrayOfNumberSelection(arrayLength, options):
    options_left = list(copy.deepcopy(options).items())
    return_array = []
    for _ in range(arrayLength):
        selection = random.choice(options_left)
        return_array.append(selection)
        options_left.remove(selection)
    return return_array


def randomDate(end_dt=date(2024, 1, 1)):
    start_dt = date(2020, 1, 1)
    time_between = end_dt - start_dt
    random_days = random.randrange(time_between.days)
    random_date = start_dt + timedelta(days=random_days)
    return random_date.strftime("%d/%m/%Y")


def randomBoolean():
    return random.choice([True, False])


def randomGroup(d, size=5):
    keys = list(d.keys())
    random.shuffle(keys)
    for i in range(0, len(keys), size):
        # yield [(key, d[key]) for key in keys[i:i + size]] # return tuples of key/value pairs
        yield keys[i : i + size]  # return array of keys


def writeToFile(object, filename):
    json_object = json.dumps(object, indent=2)
    with open(filename, "w") as outfile:
        outfile.write(json_object)


def dt_to_firestore(input_dt):
    try:
        dt = datetime.combine(input_dt.date(), input_dt.time())
    except AttributeError:
        dt = datetime.combine(input_dt, datetime.min.time())

    return {
        "__datatype__": "timestamp",
        "value": {
            "_seconds": int(dt.timestamp()),
            "_nanoseconds": int((dt.timestamp() - int(dt.timestamp())) * 1e9),
        },
    }


def random_doc_id():
    return "".join(fake.uuid4().split("-")[:4])
#endregion

######################################
#  defenitions for schemas for data  #
######################################

#region
def user_userId(userType, completeAssess, assignedAssess, completeAdmin, assignAdmin, studentData, educatorData, caregiverData, adminData):
    # random.choice(["student", "educator", "admin", "caregiver"])
    user_object = {
        "userType": userType,
        "firstName": fake.first_name(),
        "lastName": fake.last_name(),
        "assessmentPid": randomAlphaNumericString(16),
        "dob": dt_to_firestore(fake.date_of_birth()),
        "assessmentsCompleted": completeAssess,
        "assessmentsAssigned": assignedAssess,
        "administrationsAssigned": completeAdmin,
        "administrationsCompleted": assignAdmin,
        "__collections__": {}
    }
    if(studentData is not None):
        user_object["studentData"] = studentData
    if(educatorData is not None):
        user_object["educatorData"] = educatorData
    if(caregiverData is not None):
        user_object["caregiverData"] = caregiverData
    if(adminData is not None):
        user_object["adminData"] = adminData
    return user_object


def create_assessment(task_id, finished=True):
    start_date = fake.date_time()
    if finished:
        return {
            "runId": random_doc_id(),
            "taskId": task_id,
            "completedOn": dt_to_firestore(fake.date_time_between(start_date)),
            "startedOn": dt_to_firestore(start_date),
            "rewardShown": True,
        }
    else:
        return {
            "runId": random_doc_id(),
            "completedOn": None,
            "startedOn": dt_to_firestore(start_date),
            "rewardShown": False,
        }


def user_administrations(assessments, completed):
    return {"completed": completed, "assessments": assessments}


def userId_resourceType():
    return {"id": randomAlphaNumericString(16)}


def user_studentData(schoolId, classId, grade, districtId, prevSchools, prevClasses):
    prevDistricts = []
    prevSchoolIds = []
    prevClassIds = []
    for school in prevSchools:
        prevDistricts.append(school[1]["districtId"])
        prevSchoolIds.append(school[0])
    for prevClassId in prevClasses:
        prevClassIds.append(prevClassId[0])
    return {
        "ell": randomBoolean(),
        "grade": grade,
        "classId": classId,
        "previousClassIds": list(set(prevClassIds)),
        "schoolId": schoolId,
        "previousSchoolIds": list(set(prevSchoolIds)),
        "districtId": districtId,
        "previousDistrictIds": list(set(prevDistricts)),
        "studies": list_of_doc_ids(random.randint(0, 6)),
        "previousStudies": list_of_doc_ids(random.randint(1, 6)),
    }


def user_educatorData(schoolId, districtId, prevSchools):
    prevDistricts = []
    prevSchoolIds = []
    for school in prevSchools:
        prevDistricts.append(school[1]["districtId"])
        prevSchoolIds.append(school[0])
    return {
        "previousClassIds": list_of_doc_ids(random.randint(2, 6)),
        "schoolId": schoolId,
        "previousSchoolIds": prevSchoolIds,
        "districtId": districtId,
        "previousDistrictIds": prevDistricts,
        "studies": list_of_doc_ids(random.randint(0, 4)),
        "previousStudies": list_of_doc_ids(random.randint(2, 6)),
    }


def user_careGiverData(studentIds):
    return {"students": studentIds}


def user_adminData(districtId, schoolList, classList):
    return {
        "administrationsCreated": [],
        "permissions": arrayOfStrings(random.randint(1, 4), 16),
        "classes": classList,
        "studies": list_of_doc_ids(random.randint(10, 20)),
        "districts": districtId,
        "schools": schoolList,
        "adminLevel": random.choice(["classes", "schools", "districts", "studies"]),
    }


def create_district():
    return {
        "districtName": "District-{}".format(randomAlphaNumericString(4)),
        "schools": list_of_doc_ids(
            random.randint(NUM_SCHOOLS_PER_LOW, NUM_SCHOOLS_PER_HIGH)
        ),
    }


def school(districtId):
    return {
        "schoolName": "School-{}".format(randomAlphaNumericString(4)),
        "districtId": districtId,
        "__collections__": {}
    }


def classId(schoolId):
    return {"schoolId": schoolId, "grade": random.randint(0, 12)}


def studies():
    return {"studyId": random_doc_id()}


def administrationId(users, classes, schools, districts, grades, assessment):
    date_opened = fake.date_time()
    date_closed = fake.date_time_between(date_opened)
    return {
        "users": users,
        "classes": classes,
        "schools": schools,
        "districts": districts,
        "grades": grades,
        "dateOpened": dt_to_firestore(date_opened),
        "dateClosed": dt_to_firestore(date_closed),
        "assessments": assessment,
        "sequential": randomBoolean(),
    }
#endregion

###############################
#  schemas for gse firestore  #
###############################

#region

def gse_trial(trialId):
  return {
    random_doc_id(): {
      "id": trialId 
    }
  }

def gse_run(runId, completed, trials, classId, districtId, schoolId):
  return {
    "id": runId,
    "completed": completed,
    "classId": classId,
    "districtId": districtId,
    "schoolId": schoolId,
    "studyId": "",
    "__collections__": {
      "trials": trials
    }
  }

def gse_user(userId, birthday, classId, schoolId, districtId, studies, tasks, varients):
  birthdayDatetime = datetime.strptime(birthday, "%d/%m/%Y")
  return {
    "id": userId,
    "birthMonth": birthdayDatetime.month,
    "birthYear": birthdayDatetime.year,
    "classId": classId,
    "districtId": districtId,
    "firebaseUid": "",
    "schoolId": schoolId,
    "studyId": "",
    "studies": studies,
    "tasks": tasks,
    "taskRefs": [],
    "variants": varients,
    "variantRefs": [],
    "__collections__": {
      "runs": {}
    }
  }

def variant(varientId, description, name, blocks):
    return {
      "id": varientId,
      "description": description,
      "name": name,
      "scrHash": "",
      "blocks": blocks,
      "blocksString": json.dumps(blocks)
    }
#endregion

###################
#  Generate data  #
###################

#region
NUM_DISTRICTS = 3
NUM_SCHOOLS_PER_LOW = 3
NUM_SCHOOLS_PER_HIGH = 3
NUM_EDUCATORS_PER_LOW = 2
NUM_EDUCATORS_PER_HIGH = 2
NUM_STUDENTS_PER_LOW = 1
NUM_STUDENTS_PER_HIGH = 1
districts = {}
schools = {}
students = {}
admins = {}
educators = {}
classes = {}
prevClasses = {}
administrations = {}
user_admins = {}
users = {}

gse_users = {}
gse_runs = {}
gse_tasks = {
    "swr": {
      "id": "swr",
      "description": "SWR Description Text",
      "name": "Single Word Recognition",
      "__collections__": { "variants": {} }
    },
    "pa": {
      "id": "pa",
      "description": "PA Description Text",
      "name": "PA Name",
      "__collections__": { "variants": {} }
    },
    "sre": {
      "id": "sre",
      "description": "SRE Description Text",
      "name": "Sentence Reading Efficiency",
      "__collections__": { "variants": {} }
    },
    "fakeTask": {
      "id": "fakeTask",
      "description": "Fake Task Description Text",
      "name": "Fake Task",
      "__collections__": { "variants": {} }
    }
}
gse_trials = {}
#create varients of tasks
gse_varients = {}
for task in gse_tasks:
    gse_varients[task] = []
    for _ in range(random.randint(1,3)):
        blocks = []
        for index in range(random.randint(1,3)):
            blocks.append({
                "blockNumber": index,
                "corpus": "randomCorpusId",
                "trialMethod": "trialMethod"
            })
        varientId = random_doc_id()
        newVarient = variant(
            varientId, 
            "variant Description", 
            randomAlphaNumericString(4, 'varient-'), 
            blocks)
        gse_varients[task].append(newVarient)
        # print(gse_tasks[task]["__collections__"])
        gse_tasks[task]["__collections__"]["variants"][varientId] = newVarient

# Create districts
for _ in range(NUM_DISTRICTS):
    districts[random_doc_id()] = create_district()

# For each district, create schools
for district in districts:
    for schoolId in districts[district]["schools"]:
        schools[schoolId] = school(district)
classes_by_school = {}
student_by_classes = {}
# For each school, create educators, classes
for school in schools:
    # Create educators
    for _ in range(random.randint(NUM_EDUCATORS_PER_LOW, NUM_EDUCATORS_PER_HIGH)):
        educatorKey = random_doc_id()
        educatorObj = user_educatorData(
            school,
            schools[school]["districtId"],
            arrayOfNumberSelection(random.randint(0, 3), schools),
        )
        educators[educatorKey] = educatorObj
        users[educatorKey] = user_userId("educator", None, None, None, None, None, educatorObj, None, None)

    # For each educator, make a class
    classes_by_school[school] = []
    for educator in educators:
        newClass = classId(school)
        newClassId = random_doc_id()
        classes[newClassId] = newClass
        classes_by_school[school].append(newClassId)
        # Create a list of 'previous classes' for this school
        finishedClasses = {}
        for _ in range(4):
            finishedClasses[random_doc_id()] = classId(school)
        # save previous classes back to object, just in case we need it.
        prevClasses[school] = finishedClasses

# For each class, make some students
for x in classes:
    student_by_classes[x] = []
    for _ in range(random.randint(NUM_STUDENTS_PER_LOW, NUM_STUDENTS_PER_HIGH)):
        #student id
        studentKey = random_doc_id()
        # student obj for admin db
        newStudent = user_studentData(
            school,
            x,
            classes[x]["grade"],
            schools[school]["districtId"],
            arrayOfNumberSelection(random.randint(0, 3), schools),
            arrayOfNumberSelection(random.randint(1, 3), finishedClasses),
        )
        students[studentKey] = newStudent
        # student object for gse db
        gse_users[studentKey] = gse_user(studentKey, randomDate(), x, school, schools[school]["districtId"], [], 'never ran', [])
        # add student as a member of this class
        student_by_classes[x].append(studentKey)
        # create users object
        users[studentKey] = user_userId("student", None, None, None, None, newStudent, None, None, None)

# Create administrators for each district
for district in districts:
    admin_classes = []
    for school in districts[district]["schools"]:
        admin_classes.extend(classes_by_school[school])
    for _ in range(4):
        adminKey = randomAlphaNumericString(16)
        adminObj = user_adminData(
            district, districts[district]["schools"], admin_classes
        )
        admins[adminKey] = adminObj
        users[adminKey] = user_userId("admin", None, None, None, None, None, None, None, adminObj)

# Create caregivers for students
caregivers = {}
for student in students:
    caregiverKey = randomAlphaNumericString(16)
    caregiverObj = user_careGiverData([student])
    caregivers[caregiverKey] = caregiverObj
    users[caregiverKey] = user_userId("caregiver", None, None, None, None, None, None, caregiverObj, None)

total_admin_users = []
total_user_admins = 0
total_classes = 0
# Create a few administrations based on group of classes
for group in randomGroup(classes, random.randint(5, 10)):
    total_classes += len(group)
    # need user, school, district, grade, assesments for administration
    admin_schools = []
    admin_districts = []
    admin_grades = []
    admin_users = []
    admin_id = randomAlphaNumericString(16)
    admin_trials = {}
    # define runs for this administration
    admin_runIds = {
        "swr": {"taskId": "swr", "variant": random.choice(gse_varients["swr"])["id"]},
        "pa": {"taskId": "pa", "variant": random.choice(gse_varients["pa"])["id"]},
        "sre": {"taskId": "sre", "variant": random.choice(gse_varients["sre"])["id"]},
        "fakeTask": {"taskId": "fakeTask", "variant": random.choice(gse_varients["fakeTask"])["id"]},
    }
    admin_trials = {}
    for run in admin_runIds:
        for _ in range(4):
            trialId = randomAlphaNumericString(16)
            newTrial = gse_trial(trialId)
            gse_trials[trialId] = newTrial
            admin_trials[run] = newTrial
    swr_run = create_assessment("swr", True)
    pa_run = create_assessment("pa", True)
    sre_run = create_assessment("sre", False)
    fake_run = create_assessment("fakeTask", True)
    assessments = {"swr": swr_run, "pa": pa_run, "sre": sre_run, "fakeTask": fake_run}
            
    # Gather data for this administration
    for id in group:
        admin_school = schools[classes[id]["schoolId"]]
        admin_schools.append(classes[id]["schoolId"])
        admin_districts.append(admin_school["districtId"])
        admin_grades.append(classes[id]["grade"])
        admin_users.extend(student_by_classes[id])
        total_admin_users.extend(student_by_classes[id])
    # Generate the user_administration record
    for user in admin_users:
        total_user_admins += 1
        user_admins[user] = user_administrations(
            {"swr": swr_run, "pa": pa_run, "sre": sre_run, "fakeRun": fake_run}, False
        )
        gse_users[user]["tasks"] = ["swr", "pa", "sre", "fakeTask"]
        gse_users[user]["variants"] = [
            admin_runIds["swr"]["variant"],
            admin_runIds["pa"]["variant"],
            admin_runIds["sre"]["variant"],
            admin_runIds["fakeTask"]["variant"]
        ]
        for run in assessments:
            gse_runId = randomAlphaNumericString(16)
            gse_user_class = students[user]["classId"]
            gse_user_school = classes[gse_user_class]["schoolId"]
            gse_user_district = schools[gse_user_school]["districtId"]
            gse_run_completed = (assessments[run]['completedOn'] is not None)
            new_gse_run = gse_run(gse_runId, gse_run_completed, admin_trials[run], gse_user_class, gse_user_district, gse_user_school)
            gse_runs[gse_runId] = new_gse_run
            gse_users[user]["__collections__"]["runs"][gse_runId] = new_gse_run

    # use list(set()) to make lists of unique items
    administrations[admin_id] = administrationId(
        admin_users,
        group,
        list(set(admin_schools)),
        list(set(admin_districts)),
        list(set(admin_grades)),
        admin_runIds,
    )

#endregion

gse_db = {
    "__collections__": {
      "tasks": gse_tasks,
      "user": gse_users
    }
}
writeToFile(gse_db, 'gse_db.json')

# Add completed administrations and classes objects to user & school respectively 
for user in user_admins:
    users[user]["__collections__"]["administrations"] = user_admins
for school in classes_by_school:
    classList = {}
    for schoolId in classes_by_school:
        for classId in classes_by_school[schoolId]:
            classList[random_doc_id()] = classes[classId]
    schools[school]["__collections__"]["classes"] = classList

# Format the generated objects and write to file
db = {
    "__collections__": {
        "districts": districts,
        "schools": schools,
        "users": users,
        "administrations": administrations,
    }
}

writeToFile(db, "admin_db.json")

#TODO: add task/variant refs 