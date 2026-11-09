// Draft only: requires schema validation, authenticated principals and trusted
// resource data before it can be enforced. Missing permits must deny access.
permit (
  principal is School::User,
  action == School::Action::"readDocument",
  resource is School::Document
) when {
  principal.school == resource.school && resource.owner == principal
};

permit (
  principal is School::User,
  action == School::Action::"classifyDocument",
  resource is School::Document
) when {
  principal.school == resource.school && principal.role == "teacher" && resource.owner == principal
};
