# GuruMitra Enhancement Plan
## Project Vision, New Features & Implementation Roadmap

---

## 1. Project Aim

**GuruMitra** aims to **help teachers upskill for the future**. It is a teaching feedback platform that:

- Analyzes classroom videos (audio, transcript, posture, delivery)
- Provides actionable feedback for improvement
- Supports teachers in becoming more effective educators
- Prepares teachers for evolving classroom demands

---

## 2. Three Main Pillars

The platform emphasizes three core areas that teachers must master:

| Pillar | Description | Focus |
|--------|-------------|-------|
| **Time Management** | Efficient use of class time, pacing, and duration control | Ensuring syllabus coverage without rushing or dragging |
| **Priority** | Knowing what to focus on first and what can be deprioritized | Teaching important concepts before peripheral ones |
| **Planning** | Year-long planning based on calendar, exams, and holidays | Adjusting pace and content distribution across the academic year |

### Planning – Detailed Scope

Teachers should **plan their whole year at the beginning** by:

1. **Calendar-based planning**
   - Exam dates
   - Holidays and breaks
   - Festivals and school events
   - Buffer days for revision/catch-up

2. **Pacing adjustment**
   - Distributing syllabus across available teaching days
   - Setting milestones (e.g., “finish unit X before holiday Y”)
   - Allocating time for revision before exams

3. **Implementation in GuruMitra**
   - Calendar view or timeline for the academic year
   - Exam/holiday markers
   - Syllabus → time allocation mapping
   - Reminders for milestones and pacing

---

## 3. Posture Analysis – New Parameters to Add

Beyond current metrics (slouching, head tilt, shoulder tension, gesture count, etc.), the following parameters must be added:

| # | Parameter | Description | Detection Approach |
|---|-----------|-------------|---------------------|
| 1 | **Eye contact with students** | Does the teacher look at the camera/class instead of elsewhere? | Face/eye direction estimation, gaze toward camera vs. downward/side |
| 2 | **Phone usage during class** | Is the teacher using a phone during the session? | Object detection for phones in hand or near face |
| 3 | **Reading from textbook vs. explaining** | Is the teacher mostly reading from a book/notes instead of explaining? | Head-down pose, document/object detection, pose vs. “explaining” pose patterns |

Each parameter needs:
- A clear definition
- A detection/estimation method
- Thresholds for pass/fail or scoring
- Feedback messages and recommendations

---

## 4. What Has to Be Done – Summary Checklist

### A. Posture Analysis Enhancements

- [ ] **Eye contact detection**
  - Integrate face/eye/gaze estimation (MediaPipe Face Mesh, gaze estimation models, or similar)
  - Define “looking at camera” vs. “looking away” (e.g., head yaw/pitch ranges)
  - Compute % of time maintaining eye contact
  - Add feedback: “Maintain more eye contact with students” / “Good eye contact maintained”

- [ ] **Phone usage detection**
  - Use object detection (YOLO, TensorFlow, or similar) for phones
  - Track phone-in-hand or phone-near-face per frame
  - Compute % of frames with phone visible
  - Add feedback: “Avoid using phone during class” when threshold exceeded

- [ ] **Reading vs. explaining detection**
  - Detect head-down pose (e.g., pitch toward desk)
  - Optionally detect documents/books in frame
  - Classify frames as “reading” vs. “explaining” (e.g., upright, facing camera, gesturing)
  - Compute ratio of reading time vs. explaining time
  - Add feedback: “Reduce reading from textbook; focus on explanation and engagement”

### B. Time Management, Priority & Planning

- [ ] **Planning module**
  - Academic calendar (exams, holidays, events)
  - Syllabus breakdown (topics, units, chapters)
  - Time allocation per topic
  - Milestone and deadline tracking

- [ ] **Time management metrics**
  - Pacing analysis: actual vs. planned progress
  - Alerts if behind schedule or rushing
  - Suggestions for reallocation

- [ ] **Priority support**
  - Mark topics as high/medium/low priority
  - Suggest order of teaching based on exams and importance
  - Integration with planning and time management

---

## 5. How It Should Be Implemented

### 5.1 Eye Contact Detection

**Approach:**
- Use MediaPipe Face Mesh or Face Detection for face landmarks
- Estimate head pose (yaw, pitch) from landmarks
- Define “eye contact” as head facing camera within a range (e.g., yaw ±20°, pitch ±15°)
- Sample frames (e.g., every 5th frame) to avoid heavy computation

**Output:**
- `eye_contact_percent`: % of analyzed frames with eye contact
- Feedback: “Eye contact maintained for X% of the session” or “Increase eye contact with students”

**Files to modify:**
- `gurumitra-ai/posture_analyzer.py` – add eye contact logic
- `gurumitra-frontend/.../TeacherFeedback.jsx` – display eye contact metric

---

### 5.2 Phone Usage Detection

**Approach:**
- Use object detection model (e.g., YOLOv8, TensorFlow Object Detection) trained on “cell phone” class
- Run on sampled frames (e.g., every 10th frame)
- Count frames where phone is detected in the teacher’s region (e.g., upper half of frame)
- Threshold: e.g., >5% of frames with phone → negative feedback

**Output:**
- `phone_usage_percent`: % of frames with phone detected
- Feedback: “Phone usage detected during class. Avoid using phone while teaching.”

**Dependencies:**
- `ultralytics` (YOLO) or `tensorflow` + object detection API

---

### 5.3 Reading vs. Explaining Detection

**Approach:**
- **Head pose:** Head-down (pitch < -20°) suggests reading from desk
- **Optional:** Document/book detection in lower half of frame
- **Gesture count:** Low gestures + head-down → likely reading
- **Rule:** If head-down % > X and gesture_count low → “Reading from textbook” behavior

**Output:**
- `reading_posture_percent`: % of frames with head-down/reading pose
- `explaining_posture_percent`: % of frames with upright, facing-camera pose
- Feedback: “Teacher was reading from materials for X% of the session. Focus on explaining and engaging with students.”

---

### 5.4 Time Management, Priority & Planning

**Approach:**
- **New module:** `gurumitra-ai/planning` or extend backend with planning APIs
- **Database:** Store calendar events, syllabus, milestones, teacher progress
- **Frontend:** New pages/sections:
  - Academic calendar
  - Syllabus timeline with exam/holiday markers
  - Progress vs. plan view
  - Alerts for pacing issues

**Data model (conceptual):**
```
AcademicYear
  - start_date, end_date
  - events: [Exam, Holiday, Festival, Buffer]
  - syllabus: [Topic, allocated_days, priority, status]
  - milestones: [name, target_date, completed]
```

**APIs (examples):**
- `POST /planning/calendar` – add events
- `GET /planning/timeline` – get year plan with progress
- `PUT /planning/syllabus` – update topic allocation and priority
- `GET /planning/pacing` – compare actual vs. planned progress

---

## 6. Implementation Phases

| Phase | Scope | Estimated effort |
|-------|-------|------------------|
| **Phase 1** | Eye contact detection (posture_analyzer) | 2–3 days |
| **Phase 2** | Phone usage detection (new detector + posture integration) | 3–4 days |
| **Phase 3** | Reading vs. explaining detection (pose + optional document detection) | 3–4 days |
| **Phase 4** | Planning module – data model, APIs, calendar UI | 1–2 weeks |
| **Phase 5** | Time management metrics and pacing dashboard | 1 week |
| **Phase 6** | Priority support and integration with planning | 3–5 days |

---

## 7. Technical Considerations

1. **Performance:** New detectors (phone, document) increase processing time. Consider:
   - Frame sampling (e.g., every 5–10 frames)
   - Async processing for heavy models
   - Caching results per session

2. **Accuracy:** Detection quality depends on:
   - Camera angle and resolution
   - Lighting
   - Teacher visibility (full vs. partial body)

3. **Fallbacks:** If detection fails (e.g., face not visible), return neutral or “insufficient data” instead of wrong feedback.

4. **Configuration:** Make thresholds (eye contact %, phone %, reading %) configurable (e.g., via env or admin UI).

---

## 8. Success Criteria

- Eye contact, phone usage, and reading vs. explaining metrics are computed and shown in the UI.
- Teachers receive clear, actionable feedback for each new parameter.
- Planning module supports year-long calendar, syllabus, and milestones.
- Pacing and priority features help teachers adjust their teaching schedule.
- All enhancements align with the aim: **helping teachers upskill for the future**.

---

## 9. References & Resources

- **MediaPipe Face Mesh:** [Google MediaPipe](https://google.github.io/mediapipe/solutions/face_mesh.html)
- **Object detection (phone):** YOLOv8, COCO dataset includes “cell phone” class
- **Head pose estimation:** MediaPipe Face Mesh landmarks or dedicated head-pose libraries

---

*Document Version: 1.0*  
*Last Updated: February 2025*
