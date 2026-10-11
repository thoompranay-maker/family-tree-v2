/*
  EDIT THIS FILE to maintain your family tree.
  Use a unique id for every person. Relationship fields contain IDs, not names.
  Dates should use YYYY-MM-DD when known. Leave unknown details as "" or [].
  photo can be a relative path such as "images/person-name.jpg".
*/
window.FAMILY_DATA = [
  {id:"p1",fullName:"Amara Rao",gender:"female",birthDate:"1932-04-11",deathDate:"2010-02-03",photo:"",role:"Great-grandmother",hometown:"Sample village",biography:"A fictional sample ancestor remembered for bringing the family together.",occupation:"Homemaker",parentIds:[],spouseIds:["p2"],branch:"paternal",notes:"Fictional sample record."},
  {id:"p2",fullName:"Dev Rao",gender:"male",birthDate:"1928-09-19",deathDate:"2001-07-14",photo:"",role:"Great-grandfather",hometown:"Sample village",biography:"A fictional sample ancestor who helped establish the family home.",occupation:"Farmer",parentIds:[],spouseIds:["p1"],branch:"paternal",notes:"Fictional sample record."},
  {id:"p3",fullName:"Meera Rao",gender:"female",birthDate:"1954-01-23",photo:"",role:"Grandmother",hometown:"Hyderabad",biography:"A fictional grandmother who loved family gatherings.",occupation:"Teacher",parentIds:["p1","p2"],spouseIds:["p4"],branch:"paternal",notes:"Fictional sample record."},
  {id:"p4",fullName:"Raghav Rao",gender:"male",birthDate:"1950-06-05",photo:"",role:"Grandfather",hometown:"Hyderabad",biography:"A fictional grandfather and the family storyteller.",occupation:"Engineer",parentIds:[],spouseIds:["p3"],branch:"paternal",notes:"Fictional sample record."},
  {id:"m1",fullName:"Lakshmi Devi",gender:"female",birthDate:"1956-03-18",photo:"",role:"Grandmother",hometown:"Warangal",biography:"A fictional maternal-side ancestor known for her kindness.",occupation:"Homemaker",parentIds:[],spouseIds:["m2"],branch:"maternal",notes:"Fictional sample record."},
  {id:"m2",fullName:"Srinivas Kumar",gender:"male",birthDate:"1952-12-02",photo:"",role:"Grandfather",hometown:"Warangal",biography:"A fictional maternal-side ancestor.",occupation:"Shopkeeper",parentIds:[],spouseIds:["m1"],branch:"maternal",notes:"Fictional sample record."},
  {id:"p5",fullName:"Anand Rao",gender:"male",birthDate:"1978-08-12",photo:"",role:"Father",hometown:"Hyderabad",biography:"Fictional sample parent.",occupation:"Accountant",parentIds:["p3","p4"],spouseIds:["m3"],branch:"paternal",notes:"Fictional sample record."},
  {id:"p6",fullName:"Kiran Rao",gender:"male",birthDate:"1981-11-07",photo:"",role:"Uncle",hometown:"Hyderabad",biography:"Fictional sample uncle and sibling of Anand.",occupation:"Designer",parentIds:["p3","p4"],spouseIds:["p7"],branch:"paternal",notes:"Fictional sample record."},
  {id:"p7",fullName:"Sita Rao",gender:"female",birthDate:"1983-05-27",photo:"",role:"Aunt",hometown:"Hyderabad",biography:"Fictional sample aunt.",occupation:"Nurse",parentIds:[],spouseIds:["p6"],branch:"paternal",notes:"Fictional sample record."},
  {id:"m3",fullName:"Priya Kumar",gender:"female",birthDate:"1982-02-14",photo:"",role:"Mother",hometown:"Hyderabad",biography:"Fictional sample parent.",occupation:"Architect",parentIds:["m1","m2"],spouseIds:["p5"],branch:"maternal",notes:"Fictional sample record."},
  {id:"c1",fullName:"Arjun Rao",gender:"male",birthDate:"2005-10-21",photo:"",role:"Cousin",hometown:"Hyderabad",biography:"Fictional sample cousin, child of Kiran and Sita.",occupation:"Student",parentIds:["p6","p7"],spouseIds:[],branch:"paternal",notes:"Fictional sample record."},
  {id:"c2",fullName:"Anika Rao",gender:"female",birthDate:"2008-07-09",photo:"",role:"Cousin",hometown:"Hyderabad",biography:"Fictional sample cousin, child of Kiran and Sita.",occupation:"Student",parentIds:["p6","p7"],spouseIds:[],branch:"paternal",notes:"Fictional sample record."},
  {id:"me",fullName:"Aarav Rao",gender:"male",birthDate:"2008-03-15",photo:"",role:"Child",hometown:"Hyderabad",biography:"Fictional sample child at the centre of this branch.",occupation:"Student",parentIds:["p5","m3"],spouseIds:[],branch:"all",notes:"Fictional sample record."},
  {id:"s1",fullName:"Diya Rao",gender:"female",birthDate:"2011-12-30",photo:"",role:"Sister",hometown:"Hyderabad",biography:"Fictional sample sibling.",occupation:"Student",parentIds:["p5","m3"],spouseIds:[],branch:"all",notes:"Fictional sample record."}
];
